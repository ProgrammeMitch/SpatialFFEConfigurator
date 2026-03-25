import { globalEventBus } from '../core/EventBus.js';

export class HUD {
    constructor() {
        // 1. Grab the DOM elements from index.html
        this.panel = document.getElementById('hud-panel');
        this.title = document.getElementById('hud-title');
        this.manufacturer = document.getElementById('hud-manufacturer');
        this.distanceVal = document.getElementById('wall-dist-val'); // We'll use this for coordinates for now
        this.removeBtn = document.getElementById('hud-remove-btn');

        this.currentObjectId = null;

        if (!this.panel) {
            console.error('HUD: UI elements not found in DOM.');
            return;
        }

        // 2. Listen for the drop event
        globalEventBus.on('FURNITURE_PLACED', (data) => {
            this.updateDisplay(data);
        });

        // Optional: Hide the HUD if the user starts dragging again to keep the screen clean
        globalEventBus.on('DRAG_STARTED', () => {
            this.panel.classList.add('hidden');
        });

        if (this.removeBtn) {
            this.removeBtn.addEventListener('click', () => {
                if (this.currentObjectId) {
                    console.log(`HUD: Requesting removal of object ${this.currentObjectId}`);
                    
                    // Shout to the system to delete this specific UUID
                    globalEventBus.emit('REMOVE_FURNITURE', this.currentObjectId);
                    
                    // Hide the HUD since the item is gone
                    this.panel.classList.add('hidden');
                    this.currentObjectId = null;
                }
            });
        }
    }

    updateDisplay(data) {
        const { object, bimData, clearance } = data;

        // Save the unique Three.js UUID so we know exactly which chair this is
        this.currentObjectId = object.uuid;
        
        // Inject the BIM metadata
        this.title.textContent = bimData.name;
        this.manufacturer.textContent = `Provider: ${bimData.manufacturer}`;

        // Inject the calculated distance into the UI!
        if (clearance === "N/A") {
            this.distanceVal.textContent = "No walls detected";
        } else {
            this.distanceVal.textContent = `${clearance}m`;
        }

        this.panel.classList.remove('hidden');

        this.panel.classList.add('pop-in');
        setTimeout(() => this.panel.classList.remove('pop-in'), 300);
    }
}