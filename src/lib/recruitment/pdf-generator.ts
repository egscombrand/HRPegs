import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export function buildOfferingHtml(
  templateHtml: string,
  replacements: Record<string, string>,
  descriptionHtml: string,
) {
  let html = templateHtml || "";

  Object.entries(replacements).forEach(([key, value]) => {
    const safeValue = value ?? "";
    html = html.replace(new RegExp(`{{${key}}}`, "g"), safeValue);
  });

  if (!/{{description}}/.test(html)) {
    if (html.match(/<\/body>/i)) {
      html = html.replace(/<\/body>/i, `${descriptionHtml}</body>`);
    } else if (html.match(/<\/html>/i)) {
      html = html.replace(/<\/html>/i, `${descriptionHtml}</html>`);
    } else {
      html = `${html}${descriptionHtml}`;
    }
  }

  return html;
}

/**
 * Generates a PDF from an HTML string or an Element.
 * This tool is designed to produce 1:1 fidelity with the provided master template.
 */
export async function generateOfferingPDF(
  htmlContent: string,
  fileName: string = "Offering_Letter.pdf",
  cssContent: string = "",
) {
  // Create a temporary container to render the HTML
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm"; // A4 Width
  container.style.backgroundColor = "white";
  container.innerHTML = `
    <style>${cssContent}</style>
    ${htmlContent}
  `;

  // Inject the container into the body
  document.body.appendChild(container);

  try {
    // Generate canvas from HTML
    const canvas = await (html2canvas as any)(container, {
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

    const imgProps = (pdf as any).getImageProperties(imgData);
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

/**
 * Generates a PDF Blob from an HTML string or an Element.
 */
export async function generateOfferingPDFBlob(
  htmlContent: string,
  cssContent: string = "",
): Promise<Blob> {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.style.backgroundColor = "white";
  container.innerHTML = `
    <style>${cssContent}</style>
    ${htmlContent}
  `;

  document.body.appendChild(container);

  try {
    const canvas = await (html2canvas as any)(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgProps = (pdf as any).getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    return pdf.output("blob");
  } catch (error) {
    console.error("Failed to generate PDF Blob:", error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
}
