import { Engine,Color,Actor,CollisionType } from "excalibur";

class GGFGameInstance {
    game: Engine;
    constructor() {
        console.log("starting engine....");
        this.game = new Engine({
            width: 640,
            height: 480,
            canvasElementId: 'game'
        });
    }

    /** Starts the game */
    async start() : Promise<any>{
        return this.game.start();
    }
    setupActors() {
        // Create an actor with x position of 150px,
        // y position of 40px from the bottom of the screen,
        // width of 200px, height and a height of 20px
        const paddle = new Actor({
            x: 150,
            y: this.game.drawHeight - 40,
            width: 200,
            height: 20
        });

        // Let's give it some color with one of the predefined
        // color constants
        paddle.color = Color.Chartreuse;

        // Make sure the paddle can partipate in collisions, by default excalibur actors do not collide
        paddle.body.collider.type = CollisionType.Fixed;

        // `game.add` is the same as calling
        // `game.currentScene.add`
        this.game.add(paddle);
    }
};


export { GGFGameInstance };
