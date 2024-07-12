const DButils = require("./DButils");

async function markAsFavorite(username, recipe_id){
    await DButils.execQuery(`insert into FavoriteRecipes values ('${username}',${recipe_id})`);
}

async function getFavoriteRecipes(username){
    const recipes_id = await DButils.execQuery(`select recipe_id from FavoriteRecipes where username='${username}'`);
    return recipes_id;
}

async function getRecipesPreview(recipe_id){
    const recipesPreview = await DButils.execQuery(
        `SELECT id, image, title, readyInMinutes, aggregateLikes, vegetarian, vegan, glutenFree FROM recipes where id ='${recipe_id}' `
      );
  
    return recipesPreview;
}


exports.markAsFavorite = markAsFavorite;
exports.getFavoriteRecipes = getFavoriteRecipes;
