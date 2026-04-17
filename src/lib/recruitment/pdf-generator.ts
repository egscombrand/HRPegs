import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Generates a PDF from an HTML string or an Element.
 * This tool is designed to produce 1:1 fidelity with the provided master template.
 */
export async function generateOfferingPDF(
  htmlContent: string,
  fileName: string = "Offering_Letter.pdf"
) {
  // Create a temporary container to render the HTML
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm"; // A4 Width
  container.style.backgroundColor = "white";
  container.innerHTML = htmlContent;
  
  // Inject the container into the body
  document.body.appendChild(container);

  try {
    // Generate canvas from HTML
    const canvas = await html2canvas(container, {
      scale: 2, // Higher scale for better quality
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    
    // Create PDF (A4 size)
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    
    // Download PDF
    pdf.save(fileName);
    
    return true;
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    throw error;
  } finally {
    // Cleanup
    document.body.removeChild(container);
  }
}
