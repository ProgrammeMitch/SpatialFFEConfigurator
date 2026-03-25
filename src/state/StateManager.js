import { globalEventBus } from '../core/EventBus.js';

export class StateManager {
    constructor() {
        // We use a Map instead of an Array. By tracking items by their unique 3D UUID,
        // we ensure that moving an existing chair just updates its coordinates, 
        // rather than duplicating it in our PDF report.
        this.placedItems = new Map();

        // Listen for the drop event from the InteractionManager
        globalEventBus.on('FURNITURE_PLACED', (data) => {
            this.recordPlacement(data);
        });

        // --- NEW: Listen for the kill command ---
        globalEventBus.on('REMOVE_FURNITURE', (uuid) => this.removeItem(uuid));
    }

    recordPlacement(data) {
        const { object, bimData, position } = data;
        
        // Save or update the record in our central database
        this.placedItems.set(object.uuid, {
            id: bimData.id,
            name: bimData.name,
            manufacturer: bimData.manufacturer,
            position: { x: position.x.toFixed(2), y: position.y.toFixed(2), z: position.z.toFixed(2) },
            objectReference: object // Keep a reference just in case we need to highlight it later
        });

        console.log(`StateManager: Layout updated. Total items in room: ${this.placedItems.size}`);
        
        // Broadcast that the official layout has changed. 
        // The HUD and PDF generator will listen for this to update their data!
        globalEventBus.emit('STATE_UPDATED', this.getLayoutData());
    }

    removeItem(uuid) {
        if (this.placedItems.has(uuid)) {
            const itemData = this.placedItems.get(uuid);
            
            // 1. Physically remove the 3D model from the Three.js Scene
            if (itemData.objectReference && itemData.objectReference.parent) {
                itemData.objectReference.parent.remove(itemData.objectReference);
            }

            // 2. Erase the data from our memory map
            this.placedItems.delete(uuid);
            
            console.log(`StateManager: Item removed. Remaining items: ${this.placedItems.size}`);
            
            // 3. Shout that the layout has changed (Useful if you have a live list UI later)
            globalEventBus.emit('STATE_UPDATED', this.getLayoutData());
        }
    }

    // A utility function for the PDF generator to grab the final list
    getLayoutData() {
        return Array.from(this.placedItems.values());
    }
}