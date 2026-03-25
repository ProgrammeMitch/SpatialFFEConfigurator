import { globalEventBus } from '../core/EventBus.js';

export class CatalogManager {
    constructor() {
        this.categories = [];
        this.furniture = []; // Array to hold all the BIM metadata
        this.isLoaded = false;
    }

    // We use async/await because fetching a file takes time
    async loadCatalog() {
        try {
            console.log('CatalogManager: Fetching catalog.json...');
            
            // In Vite, files in the /public folder are served at the root '/'
            const response = await fetch('./catalog.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Store the parsed data
            this.environments = data.environments || [];
            this.categories = data.categories;
            this.furniture = data.furniture;
            this.isLoaded = true;

            console.log(`CatalogManager: Successfully loaded ${this.furniture.length} items.`);

            // Broadcast that the data is ready for the UI and Asset managers to use
            globalEventBus.emit('CATALOG_READY', {
                environments: this.environments,
                categories: this.categories,
                items: this.furniture
            });

        } catch (error) {
            console.error('CatalogManager: Failed to load catalog data.', error);
        }
    }

    // --- Utility Methods for other managers to query data ---

    getItemById(id) {
        return this.furniture.find(item => item.id === id);
    }

    getItemsByCategory(categoryName) {
        return this.furniture.filter(item => item.category === categoryName);
    }

    getAllItems() {
        return this.furniture;
    }
}