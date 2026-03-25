import { jsPDF } from 'https://esm.sh/jspdf';
import { MathUtils } from '../utils/MathUtils.js';

export class PDFGenerator {
    constructor(engine, stateManager) {
        this.engine = engine;
        this.stateManager = stateManager;

        // Hook into the DOM button we created earlier
        this.exportBtn = document.getElementById('generate-pdf-btn');
        
        if (this.exportBtn) {
            this.exportBtn.parentElement.classList.remove('hidden');
            this.exportBtn.addEventListener('click', () => this.generateReport());
        }
    }

    async generateReport() {
        console.log('PDFGenerator: Compiling BIM Schedule...');
        
        // Visual feedback so the user knows it's working
        this.exportBtn.innerText = "Generating PDF...";
        this.exportBtn.style.background = "#555";

        // 1. THE SNAPSHOT
        // Temporarily force the camera to the Desktop Floor Plan view for a clean 2D shot
        const originalCamera = this.engine.activeCamera;
        this.engine.activeCamera = this.engine.desktopCamera; 
        
        // Force a single render frame to update the view
        this.engine.renderer.render(this.engine.scene, this.engine.desktopCamera);
        
        // Extract the canvas as an image
        const canvas = this.engine.renderer.domElement;
        const imgData = canvas.toDataURL('image/jpeg', 1.0);

        // Put the camera back to whatever the user was using (Orbit, VR, or Desktop)
        this.engine.activeCamera = originalCamera;

        // 2. INITIALIZE DOCUMENT
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // 3. HEADER
        doc.setFontSize(22);
        doc.setTextColor(20, 150, 80); // Springfield Green
        doc.text("Springfield Educational Furniture", 20, 20);
        
        doc.setFontSize(14);
        doc.setTextColor(50, 50, 50);
        doc.text("Spatial Layout & BIM Schedule", 20, 28);
        doc.setFontSize(11);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35);

        // 4. INSERT FLOOR PLAN IMAGE
        // A4 width is 210mm. We place it at X:20, Y:40, Width:170, Height:95
        doc.addImage(imgData, 'JPEG', 20, 42, 170, 95);

        // 5. BUILD THE BIM SCHEDULE
        let yPos = 150;
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text("Bill of Materials & Spatial Clearances", 20, yPos);
        
        doc.setFontSize(11);
        yPos += 8;

        const layoutData = this.stateManager.getLayoutData();
        
        if (layoutData.length === 0) {
            doc.text("No furniture placed in this configuration.", 20, yPos);
        } else {
            layoutData.forEach((item, index) => {
                // Re-calculate the exact wall clearance at the moment of export!
                const clearance = MathUtils.getDistanceToNearestWall(item.objectReference, this.engine.scene);
                
                doc.setFont(undefined, 'bold');
                doc.text(`${index + 1}. ${item.name}`, 20, yPos);
                doc.setFont(undefined, 'normal');
                
                yPos += 5;
                doc.text(`Provider: ${item.manufacturer}   |   Catalog ID: ${item.id}`, 25, yPos);
                
                yPos += 5;
                doc.text(`World Coordinates: (X: ${item.position.x}m, Z: ${item.position.z}m)`, 25, yPos);
                
                yPos += 5;
                const clearanceText = clearance === "N/A" ? "No boundaries detected" : `${clearance}m`;
                doc.text(`Clearance to Nearest Wall: ${clearanceText}`, 25, yPos);
                
                yPos += 10; // Add space before the next item

                // Page break logic if the list gets too long
                if (yPos > 275) {
                    doc.addPage();
                    yPos = 20;
                }
            });
        }

        // 6. SAVE AND DOWNLOAD
        doc.save('Springfield-BIM-Schedule.pdf');
        
        // Reset the button
        this.exportBtn.innerText = "Finalize & Export PDF";
        this.exportBtn.style.background = "#149650";
        console.log('PDFGenerator: Download complete.');
    }
}