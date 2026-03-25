import * as THREE from 'three';

export class MathUtils {
    static getDistanceToNearestWall(object, scene) {
        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3();
        
        // 1. Get the absolute center of the 3D object
        const box = new THREE.Box3().setFromObject(object);
        box.getCenter(origin);

        // Raise the laser half a meter off the ground so it hits walls, 
        // avoiding floor meshes or baseboards.
        origin.y = 0.5; 

        // 2. Define the 4 cardinal directions (N, S, E, W)
        const directions = [
            new THREE.Vector3(1, 0, 0),  // +X
            new THREE.Vector3(-1, 0, 0), // -X
            new THREE.Vector3(0, 0, 1),  // +Z
            new THREE.Vector3(0, 0, -1)  // -Z
        ];

        // 3. Find all environment meshes (the walls)
        const environments = [];
        scene.traverse((child) => {
            if (child.userData.isEnvironment) environments.push(child);
        });

        if (environments.length === 0) return "N/A";

        let minDistance = Infinity;

        // 4. Fire the 4 lasers
        directions.forEach(dir => {
            raycaster.set(origin, dir);
            const intersects = raycaster.intersectObjects(environments, true);

            if (intersects.length > 0) {
                let dist = intersects[0].distance;
                
                // 5. THE BIM OFFSET
                // Subtract the furniture's physical radius using the JSON metadata!
                // This ensures we measure from the edge of the object to the wall.
                const bimData = object.userData;
                let offset = 0;
                
                if (bimData && bimData.dimensions) {
                    if (dir.x !== 0) offset = bimData.dimensions.width / 2;
                    if (dir.z !== 0) offset = bimData.dimensions.depth / 2;
                }
                
                dist = dist - offset;
                if (dist < minDistance) minDistance = dist;
            }
        });

        // Return formatted string, or N/A if it shot into the void
        return minDistance === Infinity ? "N/A" : Math.max(0, minDistance).toFixed(2);
    }
}