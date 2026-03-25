import { globalEventBus } from '../core/EventBus.js';

export class SidebarManager {
    constructor() {
        this.sidebarWrapper = document.getElementById('sidebar-palette');
        this.roomContainer = document.getElementById('room-items-container');
        this.furnitureContainer = document.getElementById('catalog-items-container');
        this.furnitureWrapper = document.getElementById('furniture-wrapper');

        // 1. Build the menus when JSON data arrives
        globalEventBus.on('CATALOG_READY', (data) => {
            this.buildRooms(data.environments);
            this.buildFurniture(data.items);
            this.sidebarWrapper.classList.remove('hidden');
        });

        // 2. Unlock the furniture menu ONLY when a room is loaded
        globalEventBus.on('ENVIRONMENT_READY', () => {
            this.furnitureWrapper.style.opacity = '1';
            this.furnitureWrapper.style.pointerEvents = 'auto';
        });
    }

    buildRooms(environments) {
        this.roomContainer.innerHTML = '';
        environments.forEach(room => {
            const btn = document.createElement('div');
            btn.className = 'catalog-item';
            btn.innerHTML = `<div class="item-name">${room.name}</div>`;
            
            btn.addEventListener('click', () => {
                globalEventBus.emit('ROOM_SELECTED', room);
            });
            this.roomContainer.appendChild(btn);
        });
    }

    buildFurniture(items) {
        this.furnitureContainer.innerHTML = '';
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'catalog-item';
            card.innerHTML = `<div class="item-name">${item.name}</div><div class="item-category">${item.category}</div>`;
            
            card.addEventListener('click', () => {
                globalEventBus.emit('ITEM_SELECTED', item);
            });
            this.furnitureContainer.appendChild(card);
        });
    }
}