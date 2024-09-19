var express = require("express");
var router = express.Router();
const DButils = require("../routes/utils/DButils");
const recipes_utils = require("./utils/recipes_utils");
const multer = require("multer");
const path = require("path");


router.get("/randomRecipes", async (req, res, next) => {
  try {
    // Fetch recipe details from the recipes table
    const response = await recipes_utils.getRandomRecipesSpooncular();

    // Only send the data property from the response
    res.status(200).json(response.data);
  } catch (error) {
    next(error);
  }
});

router.get("/familyRecipes", async (req, res, next) => {
  try {
    // Fetch recipe details from the recipes table
    const recipes = await recipes_utils.getRecipePreviewList([77777,88888,99999]);

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

    if (! (await recipes_utils.isFamilyOrMyRecipe(recipe_id))) {
      // If the recipe is not found in the local database, fetch it from Spoonacular API
      const response = await recipes_utils.getRecipeInformation(recipe_id);
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
    const response = await recipes_utils.searchRecipe(query, cuisineParam, dietParam, intolerancesParam, number);

    const recipeResults = response.data.results;

    // Map over the search results and fetch detailed information for each recipe
    const detailedRecipes = await Promise.all(
      recipeResults.map(async (recipe) => {
        const detailedRecipeResponse = await recipes_utils.getRecipeInformation(recipe.id);
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


module.exports = router;
