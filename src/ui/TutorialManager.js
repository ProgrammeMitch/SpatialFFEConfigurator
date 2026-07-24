export class TutorialManager {
    constructor() {
        const hasSeenTutorial = localStorage.getItem('viisp_tutorial_complete');
        if (hasSeenTutorial) return;

        this.currentStep = -1; // -1 represents the welcome screen
        this.currentListener = null;
        this.currentTarget = null;
        this.currentEventType = null;
        
        // State Machine Definition
        this.steps = [
            {
                // Step 1
                targetId: 'room-items-container', 
                text: "Select A Classroom",
                position: 'right',
                trigger: 'click', // Auto-advances when clicked
                allowCanvas: false
            },
            {
                // Step 2
                targetId: 'furniture-wrapper', 
                text: "Select Furniture to populate the classroom",
                position: 'right',
                trigger: 'click', // Auto-advances when clicked
                allowCanvas: false
            },
            {
                // Step 3
                targetId: 'webgl-container',
                text: "Mouse Wheel: Zoom in/out Classroom\n\nRight Click and Drag Mouse: Move Classroom",
                position: 'center',
                trigger: 'manual', // Requires button click so they have time to practice
                allowCanvas: true  // Lets the mouse interact with the 3D scene
            },
            {
                // Step 4
                targetId: 'webgl-container',
                text: "Left Click Mouse: Drag Furniture to desired setting\n\nClick Furniture then Drag yellow arrow left and right to change direction of furniture",
                position: 'center',
                trigger: 'manual', 
                allowCanvas: true
            },
            {
                // Step 5: Enter Orbit Mode
                targetId: 'orbit-toggle-btn',
                text: "Click Enable Orbit to enter orbit mode.",
                position: 'right',
                trigger: 'click', // Auto-advances when they activate the toggle
                allowCanvas: false
            },
            {
                // Step 6: Exit Orbit Mode (Fixes the stuck bug)
                targetId: 'orbit-toggle-btn',
                text: "Warning: You cannot move furniture while in orbit mode.\n\nUse your mouse to navigate Orbit Mode.\n\nClick Exit 3D Orbit to return to Edit mode.",
                position: 'right',
                trigger: 'click', // Waits specifically for them to click it a second time to exit
                allowCanvas: true // Allows them to pan the camera while reading the warning
            },
            {
                // Step 7: Enter VR
                targetId: 'VRButton', 
                text: "Click here to enter VR Mode",
                position: 'left',
                trigger: 'manual', // Kept manual in case VR isn't supported, so they can just click Finish
                allowCanvas: false
            }
        ];

        this.initDOM();
        this.showWelcomeScreen();
    }

    initDOM() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'tutorial-overlay';
        document.body.appendChild(this.overlay);

        this.tooltip = document.createElement('div');
        this.tooltip.id = 'tutorial-tooltip';
        
        this.tooltipText = document.createElement('p');
        this.tooltip.appendChild(this.tooltipText);

        this.nextBtn = document.createElement('button');
        this.nextBtn.id = 'tutorial-next-btn';
        this.nextBtn.addEventListener('click', () => this.nextStep());
        this.tooltip.appendChild(this.nextBtn);

        document.body.appendChild(this.tooltip);
    }

    showWelcomeScreen() {
        this.overlay.style.display = 'block';
        this.overlay.style.pointerEvents = 'auto';
        this.tooltip.style.display = 'flex';
        
        this.tooltip.style.top = '50%';
        this.tooltip.style.left = '50%';
        this.tooltip.style.transform = 'translate(-50%, -50%)';

        this.tooltipText.innerHTML = "<h1>WELCOME TO THE VIISP TOOL DEMO.</h1>";
        this.nextBtn.innerText = "START";
        this.nextBtn.style.display = 'block';
    }

    nextStep() {
        // 1. Clean up previous element highlight
        if (this.currentStep >= 0 && this.currentStep < this.steps.length) {
            const prevStep = this.steps[this.currentStep];
            const prevEl = document.getElementById(prevStep.targetId);
            if (prevEl) prevEl.classList.remove('tutorial-highlight');
        }

        // 2. Increment Step
        this.currentStep++;

        // 3. End tutorial if sequence is complete
        if (this.currentStep >= this.steps.length) {
            this.endTutorial();
            return;
        }

        const step = this.steps[this.currentStep];
        const targetEl = document.getElementById(step.targetId);

        // Failsafe skip if element isn't rendered yet
        if (!targetEl) {
            console.warn(`Tutorial: Could not find ${step.targetId}. Skipping...`);
            this.nextStep();
            return;
        }

        // 4. Apply UI Highlight
        targetEl.classList.add('tutorial-highlight');
        this.tooltipText.innerHTML = step.text.replace(/\n/g, '<br>');

        // 5. Position Tooltip
        const rect = targetEl.getBoundingClientRect();
        this.tooltip.style.transform = 'none'; 

        if (step.position === 'right') {
            this.tooltip.style.top = `${Math.max(rect.top, 20)}px`;
            this.tooltip.style.left = `${rect.right + 20}px`;
        } else if (step.position === 'left') {
            this.tooltip.style.top = `${Math.max(rect.top, 20)}px`;
            this.tooltip.style.left = `${rect.left - 370}px`; 
        } else if (step.position === 'center') {
            this.tooltip.style.top = `${rect.top + 50}px`;
            this.tooltip.style.left = `50%`;
            this.tooltip.style.transform = 'translateX(-50%)';
        }

        // 6. Bind Event Listeners and Canvas Constraints
        this.setupStepTrigger(step);
    }

    setupStepTrigger(step) {
        // Clear previous event listeners to prevent memory leaks
        if (this.currentListener && this.currentTarget) {
            this.currentTarget.removeEventListener(this.currentEventType, this.currentListener);
        }

        // Toggle whether the mouse can pass through the dark overlay to hit Three.js
        this.overlay.style.pointerEvents = step.allowCanvas ? 'none' : 'auto';

        // Configure the "Next/Got It" button visibility
        if (step.trigger === 'manual') {
            this.nextBtn.style.display = 'block';
            this.nextBtn.innerText = (this.currentStep === this.steps.length - 1) ? "FINISH" : "GOT IT";
        } else {
            this.nextBtn.style.display = 'none';
            
            // Bind the auto-advance listener to the target DOM element
            const targetEl = document.getElementById(step.targetId);
            if (targetEl) {
                this.currentTarget = targetEl;
                this.currentEventType = step.trigger;
                
                this.currentListener = () => {
                    this.nextStep();
                };
                
                // 100ms timeout prevents immediate bubbling that could accidentally skip steps
                setTimeout(() => {
                    targetEl.addEventListener(step.trigger, this.currentListener, { once: true });
                }, 100);
            }
        }
    }

    endTutorial() {
        this.overlay.style.display = 'none';
        this.tooltip.style.display = 'none';
        localStorage.setItem('viisp_tutorial_complete', 'true');
        console.log("VIISP Tutorial Complete.");
    }
}