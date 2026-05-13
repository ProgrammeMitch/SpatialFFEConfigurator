import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Engine {
    constructor(containerElement) {
        //Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x444444);

        // 1. Create the Desktop "Floor Plan" Camera (Orthographic)
        const aspect = window.innerWidth / window.innerHeight;
        const d = 25;
        this.desktopCamera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 100);
        this.desktopCamera.position.set(0, 10, 0);
        this.desktopCamera.lookAt(0, 0, 0);

        // 2. Create the VR "Immersive" Camera (Perspective)
        this.vrCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        // We set this to 0,0,0 because the Rig will carry it!
        this.vrCamera.position.set(0, 0, 0);

        // --- NEW: THE VR RIG ---
        this.vrRig = new THREE.Group();
        this.vrRig.position.y = 1.1; // Lift the rig 1.1m into the air
        this.vrRig.add(this.vrCamera); // ONLY the vrCamera goes inside
        this.scene.add(this.vrRig);

        // 3. Orbit Camera (Perspective - Angled)
        this.orbitCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.orbitCamera.position.set(5, 5, 5);
        this.orbitCamera.lookAt(0, 0, 0);

        // Default to Desktop
        this.activeCamera = this.desktopCamera;

        //Render Setup
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.OutputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = true;
        this.renderer.xr.enabled = true;

        containerElement.appendChild(this.renderer.domElement);

        // Setup Orbit Controls but keep them disabled by default
        this.controls = new OrbitControls(this.orbitCamera, this.renderer.domElement);
        this.controls.enabled = false;

        // Auto-swap cameras based on VR session state
        this.renderer.xr.addEventListener('sessionstart', () => this.activeCamera = this.vrCamera);
        this.renderer.xr.addEventListener('sessionend', () => this.activeCamera = this.desktopCamera);

        //Responsive Resize
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Listen for when the user exits VR mode
        this.renderer.xr.addEventListener('sessionend', () => {
            this.resetCameraToDesktop();
        });

        // Listen for when the user enters VR mode
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log("Engine: Entering VR. Enforcing Perspective Camera...");

            if (this.activeCamera.isOrthographicCamera) {
                // FIX: Changed from this.perspectiveCamera to this.vrCamera
                this.activeCamera = this.vrCamera;
                this.activeCamera.updateProjectionMatrix();
            }
        });

        // Listen for mouse wheel scrolls to zoom in 2D Edit Mode
        this.renderer.domElement.addEventListener('wheel', this.onMouseWheel.bind(this), { passive: false });


    }

    // Function to toggle the view mode
    setOrbitMode(isOrbiting) {
        if (isOrbiting) {
            this.activeCamera = this.orbitCamera;
            this.controls.enabled = true;
        } else {
            this.activeCamera = this.desktopCamera;
            this.controls.enabled = false;
        }
    }

    start(updateCallback) {
        this.renderer.setAnimationLoop(() => {
            if (updateCallback) updateCallback();
            this.renderer.render(this.scene, this.activeCamera);
        });
    }

    onWindowResize() {
        // 1. Get the new screen dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;

        // 2. Update the physical canvas renderer
        this.renderer.setSize(width, height);

        // 3. Update the active camera's aspect ratio
        if (this.activeCamera.isPerspectiveCamera) {
            this.activeCamera.aspect = aspect;
            this.activeCamera.updateProjectionMatrix();
        }
        else if (this.activeCamera.isOrthographicCamera) {
            // For Orthographic cameras, we have to recalculate the bounding box (frustum)
            // Assuming your initial frustum size is around 20 (adjust this number if your zoom level is different)
            const frustumSize = 50;

            this.activeCamera.left = -frustumSize * aspect / 2;
            this.activeCamera.right = frustumSize * aspect / 2;
            this.activeCamera.top = frustumSize / 2;
            this.activeCamera.bottom = -frustumSize / 2;

            this.activeCamera.updateProjectionMatrix();
        }
    }

    onMouseWheel(event) {
        if (this.activeCamera.isOrthographicCamera) {
            event.preventDefault();

            // 1. Get exact mouse screen coordinates (-1 to +1)
            const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // The Y=0 floor level

            // 2. Find out what part of the room the mouse is hovering over BEFORE zooming
            raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.activeCamera);
            const targetBefore = new THREE.Vector3();
            raycaster.ray.intersectPlane(floorPlane, targetBefore);

            // 3. Calculate and apply the new zoom level
            const zoomMultiplier = event.deltaY > 0 ? 0.9 : 1.1;
            let newZoom = this.activeCamera.zoom * zoomMultiplier;
            newZoom = Math.max(0.5, Math.min(newZoom, 4.0)); // Keep our safety limits
            this.activeCamera.zoom = newZoom;
            this.activeCamera.updateProjectionMatrix();

            // 4. Find out where that same screen pixel points AFTER zooming
            raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.activeCamera);
            const targetAfter = new THREE.Vector3();
            raycaster.ray.intersectPlane(floorPlane, targetAfter);

            // 5. Shift the camera position to perfectly bridge the gap!
            if (targetBefore && targetAfter) {
                this.activeCamera.position.x += (targetBefore.x - targetAfter.x);
                this.activeCamera.position.z += (targetBefore.z - targetAfter.z);
            }
        }
    }

    resetCameraToDesktop() {
        console.log("Engine: Forcing camera back to 2D center...");

        // We use a short interval to "bully" the camera into place.
        // This guarantees we override WebXR's delayed camera restoration.
        let attempts = 0;
        const forceReset = setInterval(() => {
            attempts++;

            // 1. Move camera directly above the room
            this.activeCamera.position.set(0, 20, 0);

            // 2. THE GIMBAL LOCK FIX: lookAt() breaks when looking straight down. 
            // We must force the raw rotation values instead.
            this.activeCamera.rotation.set(-Math.PI / 2, 0, 0);

            // 3. Reset controls (checking common variable names just in case)
            const controls = this.controls || this.orbitControls;
            if (controls) {
                controls.target.set(0, 0, 0);
                controls.update();
            }

            // 4. Reset Orthographic zoom if you are using the top-down camera
            if (this.activeCamera.isOrthographicCamera) {
                this.activeCamera.zoom = 1;
            }
            this.activeCamera.updateProjectionMatrix();

            // 5. Stop the loop after ~500ms and force a final window resize
            if (attempts > 10) {
                clearInterval(forceReset);
                this.onWindowResize(); // Clears any residual canvas weirdness
                console.log("Engine: Camera reset complete.");
            }
        }, 50);
    }
}