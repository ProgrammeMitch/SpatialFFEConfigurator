import { globalEventBus } from "../core/EventBus";

class SpatialAnalysis {
    constructor() {
        //Listen for the drop then calculate distace to walls
        globalEventBus.on('FURNITURE_PLACED', (data) => {
            console.log(`Analysing spatial impact for ${data.name}...`);
            this.calculateDistanceToNearestWall(data.position)
        })
    }
}