import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Engine {
    constructor(containerElement) {
        //Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x444444);

        // 1. Create the Desktop "Floor Plan" Camera (Orthographic)
        const aspect = window.innerWidth / window.innerHeight;
        const d = 25; // The "zoom" level for the floor plan
        this.desktopCamera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 100);
        this.desktopCamera.position.set(0, 10, 0); // High above the room
        this.desktopCamera.lookAt(0, 0, 0);

        // 2. Create the VR "Immersive" Camera (Perspective)
        this.vrCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        this.vrCamera.position.set(0, 1.6, 3);

        // 3. Orbit Camera (Perspective - Angled)
        this.orbitCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.orbitCamera.position.set(5, 5, 5); // Start at a nice 3/4 angle

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
        window.addEventListener('resize', this.resize.bind(this));
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

    resize() {
        const aspect = window.innerWidth / window.innerHeight;

        // Update Desktop Cam
        const d = 5;
        this.desktopCamera.left = -d * aspect;
        this.desktopCamera.right = d * aspect;
        this.desktopCamera.updateProjectionMatrix();

        // Update VR Cam
        this.orbitCamera.aspect = aspect;
        this.orbitCamera.updateProjectionMatrix();
        this.vrCamera.aspect = aspect;
        this.vrCamera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}