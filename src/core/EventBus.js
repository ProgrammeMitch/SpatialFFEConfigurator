export class EventBus {
    constructor() {
        this.listeners = {} //this object holds all the event names and functions
    }

    //Subscribe to an event
    on(eventName, callback) {
        if(!this.listeners[eventName]) {
            this.listeners[eventName] = []
        }
        this.listeners[eventName].push(callback);
    }

    //unsuscribe
    off(eventName, callback) {
        if (!this.listeners[eventName]) return;
        this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback)
    }

    //publish an event with data
    emit(eventName, data) {
        if (!this.listeners[eventName]) return;
        this.listeners[eventName].forEach(callback => {
            callback(data)
        });
    }
}

//Export a single, global instance so all modules share the exact same bus
export const globalEventBus = new EventBus();