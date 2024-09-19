var express = require("express");
var router = express.Router();
const DButils = require("./utils/DButils");
const recipes_utils = require("./utils/recipes_utils");

/**
 * Authenticate all incoming requests by middleware
 */

/*
router.use(async function (req, res, next) {
  if (req.session && req.session.user_id) {
    DButils.execQuery("SELECT username FROM users").then((users) => {
      if (users.find((x) => x.user_id === req.session.user_id)) {
        req.username = req.session.user_id;
        next();
      }
    }).catch(err => next(err));
  } else {
    res.sendStatus(401);
  }
});
*/

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
    const recipes = await recipes_utils.getRecipePreviewList(recipeIds);

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
    if ( !(recipes_utils.isFamilyOrMyRecipe(recipe_id))) {
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
    if ( !(recipes_utils.isFamilyOrMyRecipe(recipe_id))) {
      await removeRecipeFromDB(recipe_id);  // Call the function to remove the recipe from the database
      res.status(200).send({ message: "Recipe removed from the database", success: true });
    } else {
      res.status(200).send({ message: "Removed from favorites", success: true });
    }
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
    const recipes = await recipes_utils.getRecipePreviewList(recipeIds);

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
    const recipes = await recipes_utils.getRecipePreviewList(recipeIds);

    res.status(200).json({ recipes });
  } catch (error) {
    next(error);
  }
});

async function addSpoonRecipeToDB(recipe_id){
  
  const response = await recipes_utils.getRecipeInformation(recipe_id);

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


module.exports = router;
