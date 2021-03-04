import { GGFGameInstance } from './Game';


function startGame() {
  const game = new GGFGameInstance();
  //const gb = document.getElementById("gameBox") as HTMLDivElement;
  //gb.classList.toggle("is-active");
  alert("Loading game...");
  game.start().then(() => {
    alert("Game Started!");
  });
}
function closeGame() {
  const gb = document.getElementById("gameBox") as HTMLDivElement;
  gb.classList.toggle("is-active");
}

export {startGame,closeGame};