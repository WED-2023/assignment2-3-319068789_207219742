var express = require("express");
var router = express.Router();
const DButils = require("../routes/utils/DButils");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");

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



/**
 * This path gets body with recipeId and save this recipe in the favorites list of the logged-in user
 */
router.post('/favorites', async (req, res, next) => {
  try {
    const username = req.body.username;
    const recipe_id = parseInt(req.body.recipe_id, 10); // Ensure recipe_id is an integer

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

    await DButils.execQuery(
      `DELETE FROM favoriteRecipes WHERE username = '${username}' AND recipeId = ${recipe_id}`
    );
    res.status(200).send({ message: "removed from favorites", success: true });
  } catch (error) {
    next(error);
  }
});

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

    // Insert recipe into the recipes table and get the new recipe ID
    const result = await DButils.execQuery(
      `INSERT INTO recipes (title, readyInMinutes, image, servings, summary, ingredients, instructions, aggregateLikes)
      VALUES ('${title}', ${readyInMinutes}, '${image}', ${servings}, '${summary}', '${ingredients}', '${instructions}', 0)`
    );
    const newRecipeId = result.insertId;

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
    const recipe_id = req.query.recipe_id;

    if (!recipe_id) {
      res.status(400).send({ message: "Recipe ID is required" });
      return;
    }

    // Fetch the recipe details from the recipes table
    const recipeResult = await DButils.execQuery(
      `SELECT * FROM recipes WHERE id = ${recipe_id}`
    );

    if (recipeResult.length === 0) {
      res.status(404).send({ message: "Recipe not found" });
      return;
    }

    const recipe = recipeResult[0];

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

    recipe.vegetarian = diets.some(diet => diet.name === "Vegetarian");
    recipe.vegan = diets.some(diet => diet.name === "Vegan");
    recipe.glutenFree = !intolerances.some(intolerance => intolerance.name === "Gluten");

    res.status(200).send({
      ...recipe,
      cuisines: cuisines.map(c => c.name),
      diets: diets.map(d => d.name),
      intolerances: intolerances.map(i => i.name),
      success: true
    });
  } catch (error) {
    next(error);
  }
});


async function getRecipePreviewList(recipeIds) {
  try {
    // Join the array of IDs into a comma-separated string
    const idsString = recipeIds.join(',');

    // Fetch recipe details from the recipes table
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

module.exports = router;
