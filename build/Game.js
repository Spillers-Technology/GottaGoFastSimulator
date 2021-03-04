"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GGFGameInstance = void 0;
const excalibur_1 = require("excalibur");
class GGFGameInstance {
    constructor() {
        console.log("starting engine....");
        this.game = new excalibur_1.Engine({
            width: 640,
            height: 480,
            canvasElementId: 'game'
        });
    }
    /** Starts the game */
    async start() {
        return this.game.start();
    }
    setupActors() {
        // Create an actor with x position of 150px,
        // y position of 40px from the bottom of the screen,
        // width of 200px, height and a height of 20px
        const paddle = new excalibur_1.Actor({
            x: 150,
            y: this.game.drawHeight - 40,
            width: 200,
            height: 20
        });
        // Let's give it some color with one of the predefined
        // color constants
        paddle.color = excalibur_1.Color.Chartreuse;
        // Make sure the paddle can partipate in collisions, by default excalibur actors do not collide
        paddle.body.collider.type = excalibur_1.CollisionType.Fixed;
        // `game.add` is the same as calling
        // `game.currentScene.add`
        this.game.add(paddle);
    }
}
exports.GGFGameInstance = GGFGameInstance;
;
