"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeGame = exports.startGame = void 0;
const Game_1 = require("./Game");
function startGame() {
    const game = new Game_1.GGFGameInstance();
    //const gb = document.getElementById("gameBox") as HTMLDivElement;
    //gb.classList.toggle("is-active");
    alert("Loading game...");
    game.start().then(() => {
        alert("Game Started!");
    });
}
exports.startGame = startGame;
function closeGame() {
    const gb = document.getElementById("gameBox");
    gb.classList.toggle("is-active");
}
exports.closeGame = closeGame;
