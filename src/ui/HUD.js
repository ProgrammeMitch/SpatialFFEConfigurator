import { globalEventBus } from '../core/EventBus.js';

export class HUD {
    constructor() {
        // 1. Grab the DOM elements from index.html
        this.panel = document.getElementById('hud-panel');
        this.title = document.getElementById('hud-title');
        this.manufacturer = document.getElementById('hud-manufacturer');
        this.distanceVal = document.getElementById('wall-dist-val'); // We'll use this for coordinates for now
        this.removeBtn = document.getElementById('hud-remove-btn');
        this.cost = document.getElementById('hud-cost');
        this.warranty = document.getElementById('hud-warranty');
        this.installationTime = document.getElementById('hud-installation-time');
        this.fireSafetyRating = document.getElementById('hud-fire-safety-rating');
        this.lifeCycle = document.getElementById('hud-lifecycle');
        this.material = document.getElementById('hud-material');
        this.dimensions = document.getElementById('hud-dimensions');

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
        const { object, bimData } = data;

        // Save the unique Three.js UUID so we know exactly which chair this is
        this.currentObjectId = object.uuid;
        
        // Inject the BIM metadata
        this.title.textContent = bimData.name;
        this.manufacturer.textContent = `Provider: ${bimData.manufacturer}`;
        this.cost.textContent = `Cost: ${bimData.cost}`;
        this.warranty.textContent = `Warranty: ${bimData.warranty}`;
        this.installationTime.textContent = `Installation Time: ${bimData.installationTime}`;
        this.fireSafetyRating.textContent = `Fire Safety Rating: ${bimData.fireSafetyRating}`;
        this.lifeCycle.textContent = `Lifecycle Duration: ${bimData.lifeCycle}`;
        this.material.textContent = `Material and Texture: ${bimData.material}`;
        this.dimensions.textContent = `Dimensions: ${bimData.dimensions.width}m x ${bimData.dimensions.height}m x ${bimData.dimensions.depth}m`;


        this.panel.classList.remove('hidden');

        this.panel.classList.add('pop-in');
        setTimeout(() => this.panel.classList.remove('pop-in'), 300);
    }
}