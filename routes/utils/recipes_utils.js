const axios = require("axios");
const api_domain = "https://api.spoonacular.com/recipes";
const spooncular_apiKey = "bc0c77ca8b4a4a518f9115acb4e0a38a";
const DButils = require("./DButils");

async function getRandomRecipesSpooncular() {
    // Fetch recipe details from the recipes table
    return await axios.get(`${api_domain}/random`, {
        params: {
            number: 3,
            apiKey: spooncular_apiKey
        }
    }); 
}

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
  
  
  
  async function getRecipeInformation(recipe_id) {
    return await axios.get(`${api_domain}/${recipe_id}/information`, {
      params: {
          includeNutrition: false,
          apiKey: spooncular_apiKey
      }
    });
  }
// Make a search request to the Spoonacular API
async function searchRecipe(query, cuisineParam, dietParam, intolerancesParam, number) {
  // Make a request to the Spoonacular API
  return await axios.get(`${api_domain}/complexSearch`, {
    params: {
      query: query || '', // Use empty string if query is undefined
      cuisine: cuisineParam || undefined,
      diet: dietParam || undefined,
      intolerances: intolerancesParam || undefined,
      number: number || 5, // Default to 5 if number is undefined
      apiKey: spooncular_apiKey,
    },
  });
}

async function isFamilyOrMyRecipe(recipe_id) {
  // Check if the recipe is in the my_recipes table
  const myRecipeCheck = await DButils.execQuery(
    `SELECT * FROM my_recipes WHERE recipeId = ${recipe_id}`
  );

  const isMyRecipe = myRecipeCheck.length > 0;
  const isFamilyRecipe = [77777, 88888, 99999].includes(recipe_id);
  return isMyRecipe || isFamilyRecipe;

}

  module.exports = {
    getRandomRecipesSpooncular,
    getRecipePreviewList,
    getRecipeInformation,
    searchRecipe,
    isFamilyOrMyRecipe
  };