import { globalEventBus } from "../core/EventBus";

class DragAndDrop {
    //inside realease logic
    releaseObject(activeFurniture) {
        const finalPosition = activeFurniture.position;
        const bimData = activeFurniture.userData

        //Shout to the restof the app that an item was placed
        globalEventBus.emit('FURNITURE_PLACED', {
            id: bimData.id,
            name: bimData.name,
            position: {
                x: finalPosition.x,
                y: finalPosition.y,
                z: finalPosition.z
            }
        })
    }
}