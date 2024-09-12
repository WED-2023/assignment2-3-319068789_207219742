const axios = require("axios");

var express = require("express");
var router = express.Router();
const DButils = require("../routes/utils/DButils");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");

const api_domain = "https://api.spoonacular.com/recipes";
const spooncular_apiKey = "bc0c77ca8b4a4a518f9115acb4e0a38a";


router.get("/randomRecipes", async (req, res, next) => {
  try {
    // Fetch recipe details from the recipes table
    const response = await axios.get(`${api_domain}/random`, {
      params: {
          number: 3,
          apiKey: spooncular_apiKey
      }
    });

    // Only send the data property from the response
    res.status(200).json(response.data);
  } catch (error) {
    next(error);
  }
});

router.post("/auth/Register", async (req, res, next) => {
  try {
    // parameters exists
    // valid parameters
    // username exists
    let user_details = {
      username: req.body.username,
      firstname: req.body.firstName,
      lastname: req.body.lastName,
      country: req.body.country,
      password: req.body.password,
      email: req.body.email,
    }
    //check if username is taken
    let users = [];
    users = await DButils.execQuery("SELECT username from users");

    if (users.find((x) => x.username === user_details.username))
      throw { status: 409, message: "Username taken" };

    //check if email is taken
    let emails = [];
    emails = await DButils.execQuery("SELECT email from users");

    if (emails.find((x) => x.email === user_details.email))
      throw { status: 409, message: "Email is already exist" };

    // add the new username
    let hash_password = bcrypt.hashSync(
      user_details.password,
      parseInt(process.env.bcrypt_saltRounds)
    );
    await DButils.execQuery(
      `INSERT INTO users VALUES ('${user_details.username}', '${user_details.firstname}', '${user_details.lastname}',
      '${user_details.country}', '${hash_password}', '${user_details.email}')`
    );
    res.status(201).send({ message: "user created", success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/Login", async (req, res, next) => {
  try {
    // check that username exists
    const users = await DButils.execQuery("SELECT username FROM users");
    if (!users.find((x) => x.username === req.body.username))
      throw { status: 401, message: "Username or Password incorrect" };

    // check that the password is correct
    const user = (
      await DButils.execQuery(
        `SELECT * FROM users WHERE username = '${req.body.username}'`
      )
    )[0];

    if (!bcrypt.compareSync(req.body.password, user.password)) {
      throw { status: 401, message: "Username or Password incorrect" };
    }

    // Set cookie
    req.session.user_id = user.user_id;


    // return cookie
    res.status(200).send({ message: "login succeeded", success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/Logout", function (req, res) {
  req.session.reset(); // reset the session info --> send cookie when  req.session == undefined!!
  res.send({ success: true, message: "logout succeeded" });
});

router.get("/familyRecipes", async (req, res, next) => {
  try {
    // Fetch recipe details from the recipes table
    const recipes = await getRecipePreviewList([77777,88888,99999]);

    res.status(200).json({ recipes });
  } catch (error) {
    next(error);
  }
});

// ------------------------------ Watched recipes section -------------------------------

router.post('/watched', async (req, res, next) => {
  try {
    const username = req.body.username;
    const recipe_id = parseInt(req.body.recipe_id, 10); // Ensure recipe_id is an integer

    // Fetch the recipe details from the recipes table
    const recipeResult = await DButils.execQuery(
      `SELECT * FROM recipes WHERE id = ${recipe_id}`
    );

    if (recipeResult.length === 0) {
      // If the recipe is not found in the local database, fetch it from Spoonacular API
      await addSpoonRecipeToDB(recipe_id);
    }

    // Check if the recipe is already marked as watched by the user
    const watchedResult = await DButils.execQuery(
      `SELECT * FROM watched_recipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );

    if (watchedResult.length > 0) {
      // If the recipe is already watched, update the watched_at timestamp
      await DButils.execQuery(
        `UPDATE watched_recipes SET watched_at = CURRENT_TIMESTAMP WHERE username = '${username}' AND recipeId = ${recipe_id}`
      );
    } else {
      // If the recipe is not watched, insert it into the watched_recipes table
      await DButils.execQuery(
        `INSERT INTO watched_recipes (username, recipeId) VALUES ('${username}', ${recipe_id})`
      );
    }

    res.status(201).send({ message: "Recipe marked as watched", success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/watched', async (req, res, next) => {
  try {
    const username = req.query.username;

    if (!username) {
      res.status(400).send({ message: "Username is required" });
      return;
    }

    // Fetch the last 3 watched recipe IDs for the user, ordered by the watched_at timestamp
    const watchedRecipeIds = await DButils.execQuery(
      `SELECT recipeId FROM watched_recipes WHERE username = '${username}' ORDER BY watched_at DESC LIMIT 3`
    );

    if (watchedRecipeIds.length === 0) {
      res.status(200).json({ recipes: [] });
      return;
    }

    // Get recipe previews for the watched recipes
    const recipeIds = watchedRecipeIds.map(recipe => recipe.recipeId);
    const recipes = await getRecipePreviewList(recipeIds);

    res.status(200).json({ recipes });
  } catch (error) {
    next(error);
  }
});


router.get('/isWatched', async (req, res, next) => {
  try {
    const username = req.query.username;
    const recipe_id = parseInt(req.query.recipe_id, 10);  // Ensure recipe_id is an integer

    const result = await DButils.execQuery(
      `SELECT * FROM watched_recipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );

    if (result.length > 0) {
      res.status(200).send({ isWatched: true });
    } else {
      res.status(200).send({ isWatched: false });
    }
  } catch (error) {
    next(error);
  }
});


// ------------------------------ like section ------------------------------------------

router.post('/likeRecipe', async (req, res, next) => {
  try {
    const username = req.body.username;
    const recipe_id = parseInt(req.body.recipe_id, 10); // Ensure recipe_id is an integer

    // Fetch the recipe details from the recipes table
    const recipeResult = await DButils.execQuery(
      `SELECT * FROM recipes WHERE id = ${recipe_id}`
    );

    if (recipeResult.length === 0) {
      // If the recipe is not found in the local database, fetch it from Spoonacular API
      await addSpoonRecipeToDB(recipe_id);
    }

    // Insert into the database
    await DButils.execQuery(
      `INSERT INTO likedrecipes (username, recipeId) VALUES ('${username}', ${recipe_id})`
    );

    // Increase the aggregateLikes for the recipe by 1
    await DButils.execQuery(
      `UPDATE recipes SET aggregateLikes = aggregateLikes + 1 WHERE id = ${recipe_id}`
    );
    res.status(201).send({ message: "added to liked", success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/likeRecipe', async (req, res, next) => {
  try {
    let { username, recipe_id } = req.body;
    recipe_id = parseInt(recipe_id, 10);  // Ensure recipe_id is an integer

    if (!username || isNaN(recipe_id)) {
      res.status(400).send({ message: "Invalid username or recipe_id" });
      return;
    }

    // Remove it from the user's liked recipes
    await DButils.execQuery(
      `DELETE FROM likedrecipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );

    // Decrease the aggregateLikes for the recipe by 1
    await DButils.execQuery(
      `UPDATE recipes SET aggregateLikes = aggregateLikes - 1 WHERE id = ${recipe_id}`
    );

    // If the recipe is not in my_recipes or family recipe, remove it
    if ( !(isFamilyOrMyRecipe(recipe_id))) {
      await removeRecipeFromDB(recipe_id);  // Call the function to remove the recipe from the database
      res.status(200).send({ message: "Recipe removed from the database", success: true });
    } else {
      res.status(200).send({ message: "Removed from liked", success: true });
    }
  } catch (error) {
    next(error);
  }
});

router.get('/isLiked', async (req, res, next) => {
  try {
    const username = req.query.username;
    const recipe_id = parseInt(req.query.recipe_id, 10);  // Ensure recipe_id is an integer

    const result = await DButils.execQuery(
      `SELECT * FROM likedrecipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );

    if (result.length > 0) {
      res.status(200).send({ isLiked: true });
    } else {
      res.status(200).send({ isLiked: false });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * This path gets body with recipeId and save this recipe in the favorites list of the logged-in user
 */
router.post('/favorites', async (req, res, next) => {
  try {
    const username = req.body.username;
    const recipe_id = parseInt(req.body.recipe_id, 10); // Ensure recipe_id is an integer

    // Fetch the recipe details from the recipes table
    const recipeResult = await DButils.execQuery(
      `SELECT * FROM recipes WHERE id = ${recipe_id}`
    );

    if (recipeResult.length === 0) {
      // If the recipe is not found in the local database, fetch it from Spoonacular API
      await addSpoonRecipeToDB(recipe_id);
    }

    // Insert into the database
    await DButils.execQuery(
      `INSERT INTO favoriteRecipes (username, recipeId) VALUES ('${username}', ${recipe_id})`
    );
    res.status(201).send({ message: "added to favorites", success: true });
  } catch (error) {
    next(error);
  }
});


router.delete('/favorites', async (req, res, next) => {
  try {
    let { username, recipe_id } = req.body;
    recipe_id = parseInt(recipe_id, 10);  // Ensure recipe_id is an integer

    if (!username || isNaN(recipe_id)) {
      res.status(400).send({ message: "Invalid username or recipe_id" });
      return;
    }

    // Remove it from the user's favorites
    await DButils.execQuery(
      `DELETE FROM favoriteRecipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );



    // If the recipe is not in my_recipes or family recipe, remove it
    if ( !(isFamilyOrMyRecipe(recipe_id))) {
      await removeRecipeFromDB(recipe_id);  // Call the function to remove the recipe from the database
      res.status(200).send({ message: "Recipe removed from the database", success: true });
    } else {
      res.status(200).send({ message: "Removed from favorites", success: true });
    }
  } catch (error) {
    next(error);
  }
});

async function isFamilyOrMyRecipe(recipe_id) {
      // Check if the recipe is in the my_recipes table
      const myRecipeCheck = await DButils.execQuery(
        `SELECT * FROM my_recipes WHERE recipeId = ${recipe_id}`
      );
  
      const isMyRecipe = myRecipeCheck.length > 0;
      const isFamilyRecipe = [77777, 88888, 99999].includes(recipe_id);
      return isMyRecipe || isFamilyRecipe;
  
}

router.get('/isFavorite', async (req, res, next) => {
  try {
    const username = req.query.username;
    const recipe_id = parseInt(req.query.recipe_id, 10);  // Ensure recipe_id is an integer

    const result = await DButils.execQuery(
      `SELECT * FROM favoriteRecipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );

    if (result.length > 0) {
      res.status(200).send({ isFavorite: true });
    } else {
      res.status(200).send({ isFavorite: false });
    }
  } catch (error) {
    next(error);
  }
});

router.get("/favorites", async (req, res, next) => {
  try {
    const username = req.query.username;

    if (!username) {
      res.status(400).send({ message: "Username is required" });
      return;
    }

    // Fetch favorite recipe IDs for the user
    const favoriteRecipeIds = await DButils.execQuery(
      `SELECT recipeId FROM favoriteRecipes WHERE username = '${username}'`
    );

    if (favoriteRecipeIds.length === 0) {
      res.status(200).json({ recipes: [] });
      return;
    }

    // Get recipe previews for the favorite recipes
    const recipeIds = favoriteRecipeIds.map(recipe => recipe.recipeId);
    const recipes = await getRecipePreviewList(recipeIds);

    res.status(200).json({ recipes });
  } catch (error) {
    next(error);
  }
});

router.get("/myRecipes", async (req, res, next) => {
  try {
    const username = req.query.username;

    if (!username) {
      res.status(400).send({ message: "Username is required" });
      return;
    }

    // Fetch my recipe IDs for the user
    const myRecipeIds = await DButils.execQuery(
      `SELECT recipeId FROM my_recipes WHERE username = '${username}'`
    );

    if (myRecipeIds.length === 0) {
      res.status(200).json({ recipes: [] });
      return;
    }

    // Get recipe previews for my recipes
    const recipeIds = myRecipeIds.map(recipe => recipe.recipeId);
    const recipes = await getRecipePreviewList(recipeIds);

    res.status(200).json({ recipes });
  } catch (error) {
    next(error);
  }
});


// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../uploads")); // Define upload directory
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Generate unique filename
  },
});

const upload = multer({ storage });

// Endpoint to handle image uploads 
router.post("/uploadImage", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: "No file uploaded", success: false });
    }

    const imagePath = "/uploads/" + req.file.filename; // Assuming 'uploads' is your upload directory

    // You can save the imagePath to the database or perform any other actions here

    res.status(200).send({ imagePath, success: true });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).send({ message: "Error uploading image", success: false });
  }
});


router.post("/uploadRecipe", async (req, res, next) => {

  console.log("Request Body:", req.body); // Print the request body to the console

  try {
    // Extract recipe details from the request body
    const {
      title,
      readyInMinutes,
      image,
      servings,
      summary,
      ingredients,
      instructions,
      cuisines,
      diets,
      intolerances,
      username
    } = req.body;

    // Convert instructions array to HTML formatted string
    const instructionsHTML = "<ol>" + instructions.map(step => `<li>${step}</li>`).join('') + "</ol>";

    // Insert recipe into the recipes table with the HTML-formatted instructions
    const result = await DButils.execQuery(
      `INSERT INTO recipes (title, readyInMinutes, image, servings, summary, aggregateLikes, instructions)
      VALUES ('${title}', ${readyInMinutes}, '${image}', ${servings}, '${summary}', 0, '${instructionsHTML}')`
    );
    const newRecipeId = result.insertId;

    // Insert ingredients into the ingredients table
    for (const ingredient of ingredients) {
      await DButils.execQuery(
        `INSERT INTO ingredients (recipeId, amount, unit, name)
        VALUES (${newRecipeId}, ${ingredient.amount}, '${ingredient.unit}', '${ingredient.name}')`
      );
    }

    // Insert cuisines into the recipe_cuisines table
    for (const cuisine of cuisines) {
      await DButils.execQuery(
        `INSERT INTO recipe_cuisines (recipe_id, cuisine_id)
        VALUES (${newRecipeId}, (SELECT id FROM cuisines WHERE name = '${cuisine}'))`
      );
    }

    // Insert diets into the recipe_diets table
    for (const diet of diets) {
      await DButils.execQuery(
        `INSERT INTO recipe_diets (recipe_id, diet_id)
        VALUES (${newRecipeId}, (SELECT id FROM diets WHERE name = '${diet}'))`
      );
    }

    // Insert intolerances into the recipe_intolerances table
    for (const intolerance of intolerances) {
      await DButils.execQuery(
        `INSERT INTO recipe_intolerances (recipe_id, intolerance_id)
        VALUES (${newRecipeId}, (SELECT id FROM intolerances WHERE name = '${intolerance}'))`
      );
    }

    // Insert the new recipe ID into the my_recipes table with the associated username
    await DButils.execQuery(
      `INSERT INTO my_recipes (username, recipeId) VALUES ('${username}', ${newRecipeId})`
    );

    res.status(201).send({ message: "Recipe uploaded successfully", success: true });
  } catch (error) {
    next(error);
  }
});



router.get("/getFullRecipe", async (req, res, next) => {
  try {
    const recipe_id = parseInt(req.query.recipe_id, 10);  // Ensure recipe_id is a number


    if (!recipe_id) {
      res.status(400).send({ message: "Recipe ID is required" });
      return;
    }

    // Fetch the recipe details from the recipes table
    const recipeResult = await DButils.execQuery(
      `SELECT * FROM recipes WHERE id = ${recipe_id}`
    );

    if (! (await isFamilyOrMyRecipe(recipe_id))) {
      // If the recipe is not found in the local database, fetch it from Spoonacular API
      const response = await getRecipeInformation(recipe_id);
      console.log("Response:", response.data);
      res.status(200).json(response.data);
      return;
    }

    console.log("This recipe is in the db");
    const recipe = recipeResult[0];

    // Fetch the ingredients related to the recipe
    const extendedIngredients = await DButils.execQuery(
      `SELECT amount, unit, name FROM ingredients WHERE recipeId = ${recipe_id}`
    );

    // Fetch the cuisines related to the recipe
    const cuisines = await DButils.execQuery(
      `SELECT name FROM cuisines WHERE id IN (SELECT cuisine_id FROM recipe_cuisines WHERE recipe_id = ${recipe_id})`
    );

    // Fetch the diets related to the recipe
    const diets = await DButils.execQuery(
      `SELECT name FROM diets WHERE id IN (SELECT diet_id FROM recipe_diets WHERE recipe_id = ${recipe_id})`
    );

    // Fetch the intolerances related to the recipe
    const intolerances = await DButils.execQuery(
      `SELECT name FROM intolerances WHERE id IN (SELECT intolerance_id FROM recipe_intolerances WHERE recipe_id = ${recipe_id})`
    );

    // Process the recipe details to include additional fields like vegetarian, vegan, etc.
    recipe.vegetarian = diets.some(diet => diet.name === "Vegetarian");
    recipe.vegan = diets.some(diet => diet.name === "Vegan");
    recipe.glutenFree = !intolerances.some(intolerance => intolerance.name === "Gluten");

    res.status(200).send({
      ...recipe,
      extendedIngredients: extendedIngredients.map(ing => ({
        amount: ing.amount,
        unit: ing.unit,
        name: ing.name
      })),
      instructions: recipe.instructions, // Return the HTML-formatted instructions as is
      cuisines: cuisines.map(c => c.name),
      diets: diets.map(d => d.name),
      intolerances: intolerances.map(i => i.name),
      success: true
    });
  } catch (error) {
    next(error);
  }
});

router.get("/searchRecipe", async (req, res, next) => {
  console.log("Request Query:", req.query); // Print the request query to the console
  try {
    const { query, cuisine, diet, intolerances, number } = req.query;

    // Ensure parameters are correctly formatted as strings
    const cuisineParam = Array.isArray(cuisine) ? cuisine.join(',') : cuisine || ''; // Convert array to comma-separated string
    const dietParam = Array.isArray(diet) ? diet.join(',') : diet || ''; // Convert array to comma-separated string
    const intolerancesParam = Array.isArray(intolerances) ? intolerances.join(',') : intolerances || ''; // Convert array to comma-separated string

    // Make a request to the Spoonacular API
    const response = await axios.get(`${api_domain}/complexSearch`, {
      params: {
        query: query || '', // Use empty string if query is undefined
        cuisine: cuisineParam || undefined,
        diet: dietParam || undefined,
        intolerances: intolerancesParam || undefined,
        number: number || 10, // Default to 10 if number is undefined
        apiKey: spooncular_apiKey,
      },
    });

    const recipeResults = response.data.results;

    // Map over the search results and fetch detailed information for each recipe
    const detailedRecipes = await Promise.all(
      recipeResults.map(async (recipe) => {
        const detailedRecipeResponse = await getRecipeInformation(recipe.id);
        const detailedData = detailedRecipeResponse.data;

        // Extract only the required fields
        return {
          id: detailedData.id,
          image: detailedData.image,
          title: detailedData.title,
          readyInMinutes: detailedData.readyInMinutes,
          aggregateLikes: detailedData.aggregateLikes,
          vegetarian: detailedData.vegetarian,
          vegan: detailedData.vegan,
          glutenFree: detailedData.glutenFree,
        };
      })
    );

    // Send the extracted data as the response
    res.status(200).json(detailedRecipes);
  } catch (error) {
    next(error);
  }
});




async function getRecipePreviewList(recipeIds) {
  try {
    // Join the array of IDs into a comma-separated string
    const idsString = recipeIds.join(',');

    // Fetch recipe details from the recipes table 2  
    const recipes = await DButils.execQuery(
      `SELECT id, image, title, readyInMinutes, aggregateLikes
      FROM recipes
      WHERE id IN (${idsString});`
    );

    // Fetch preferences for each recipe
    for (const recipe of recipes) {
      const [diets, intolerances] = await Promise.all([
        DButils.execQuery(
          `SELECT name
          FROM diets
          WHERE id IN (SELECT diet_id FROM recipe_diets WHERE recipe_id = ${recipe.id});`
        ),
        DButils.execQuery(
          `SELECT name
          FROM intolerances
          WHERE id IN (SELECT intolerance_id FROM recipe_intolerances WHERE recipe_id = ${recipe.id});`
        )
      ]);

      recipe.vegetarian = diets.some(diet => diet.name === "Vegetarian");
      recipe.vegan = diets.some(diet => diet.name === "Vegan");
      recipe.glutenFree = !intolerances.some(intolerance => intolerance.name === "Gluten");
    }

    return recipes;
  } catch (error) {
    throw new Error(`Failed to get recipe details: ${error.message}`);
  }
}

async function addSpoonRecipeToDB(recipe_id){

  const response = await getRecipeInformation(recipe_id);

  let {
    aggregateLikes,
    readyInMinutes,
    image,
    title,
    vegetarian,
    vegan,
    glutenFree,
    servings,
  } = response.data;

  // Insert recipe into the recipes table with the HTML-formatted instructions
  const result = await DButils.execQuery(
    `INSERT INTO recipes (id, title, readyInMinutes, image, servings, aggregateLikes)
    VALUES (${recipe_id}, '${title}', ${readyInMinutes}, '${image}', ${servings}, ${aggregateLikes})`
  );

  // Insert diets into the recipe_diets table
  if(vegetarian){
    await DButils.execQuery(
      `INSERT INTO recipe_diets (recipe_id, diet_id)
      VALUES (${recipe_id}, (SELECT id FROM diets WHERE name = 'Vegetarian'))`
    );
  }

  if(vegan){
    await DButils.execQuery(
      `INSERT INTO recipe_diets (recipe_id, diet_id)
      VALUES (${recipe_id}, (SELECT id FROM diets WHERE name = 'Vegan'))`
    );
  }

  // Insert gluten into the intolerance list if the recipe is not gluten free
  if(!glutenFree){
    await DButils.execQuery(
      `INSERT INTO recipe_intolerances (recipe_id, intolerance_id)
      VALUES (${recipe_id}, (SELECT id FROM intolerances WHERE name = 'Gluten'))` 
    );
  } 

}

async function removeRecipeFromDB(recipeId) {
  try {
    // Remove from recipe_intolerances table
    await DButils.execQuery(
      `DELETE FROM recipe_intolerances WHERE recipe_id = ${recipeId}`
    );

    // Remove from recipe_diets table
    await DButils.execQuery(
      `DELETE FROM recipe_diets WHERE recipe_id = ${recipeId}`
    );

    // Remove from recipe_cuisines table
    await DButils.execQuery(
      `DELETE FROM recipe_cuisines WHERE recipe_id = ${recipeId}`
    );

    // Remove from ingredients table
    await DButils.execQuery(
      `DELETE FROM ingredients WHERE recipeId = ${recipeId}`
    );

    // Finally, remove from recipes table
    await DButils.execQuery(
      `DELETE FROM recipes WHERE id = ${recipeId}`
    );

    console.log(`Recipe with ID ${recipeId} has been successfully removed.`);
  } catch (error) {
    console.error(`Failed to remove recipe with ID ${recipeId}:`, error);
    throw error;
  }
}


async function getRecipeInformation(recipe_id) {
  return await axios.get(`${api_domain}/${recipe_id}/information`, {
    params: {
        includeNutrition: false,
        apiKey: spooncular_apiKey
    }
  });
}

module.exports = router;
