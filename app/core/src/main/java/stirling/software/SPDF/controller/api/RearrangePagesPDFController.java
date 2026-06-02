package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.SortTypes;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class RearrangePagesPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Remove pages from a PDF file",
            description =
                    "This endpoint removes specified pages from a given PDF file. Users can provide"
                            + " a comma-separated list of page numbers or ranges to delete. Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<Resource> deletePages(@ModelAttribute PDFWithPageNums request)
            throws IOException {

        MultipartFile pdfFile = request.getFileInput();
        String pagesToDelete = request.getPageNumbers();

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {

            // Split the page order string into an array of page numbers or range of numbers
            String[] pageOrderArr = pagesToDelete.split(",");

            List<Integer> pagesToRemove =
                    GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages(), false);

            Collections.sort(pagesToRemove);

            for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
                int pageIndex = pagesToRemove.get(i);
                document.removePage(pageIndex);
            }
            FormUtils.pruneOrphanedFormFields(document);
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_removed_pages.pdf"),
                    tempFileManager);
        }
    }

    private List<Integer> duplicate(int totalPages, String pageOrder) {
        List<Integer> newPageOrder = new ArrayList<>();
        int duplicateCount;

        try {
            // Parse the duplicate count from pageOrder
            duplicateCount =
                    pageOrder != null && !pageOrder.isEmpty()
                            ? Integer.parseInt(pageOrder.trim())
                            : 2; // Default to 2 if not specified
        } catch (NumberFormatException e) {
            log.error("Invalid duplicate count specified", e);
            duplicateCount = 2; // Default to 2 if invalid input
        }

        // Validate duplicate count
        if (duplicateCount < 1) {
            duplicateCount = 2; // Default to 2 if invalid input
        }
        int maxDuplicateCount = Math.max(100, totalPages * 3);
        if (duplicateCount > maxDuplicateCount) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "duplicateCount",
                    "must not exceed " + maxDuplicateCount);
        }

        // For each page in the document
        for (int pageNum = 0; pageNum < totalPages; pageNum++) {
            // Add the current page index duplicateCount times
            for (int dupCount = 0; dupCount < duplicateCount; dupCount++) {
                newPageOrder.add(pageNum);
            }
        }

        return newPageOrder;
    }

    private List<Integer> processSortTypes(String sortTypes, int totalPages, String pageOrder) {
        try {
            SortTypes mode = SortTypes.valueOf(sortTypes.toUpperCase(Locale.ROOT));
            return switch (mode) {
                case REVERSE_ORDER -> PageOrderingUtils.reverseOrder(totalPages);
                case DUPLEX_SORT -> PageOrderingUtils.duplexSort(totalPages);
                case BOOKLET_SORT -> PageOrderingUtils.bookletSort(totalPages);
                case SIDE_STITCH_BOOKLET_SORT -> PageOrderingUtils.sideStitchBooklet(totalPages);
                case ODD_EVEN_SPLIT -> PageOrderingUtils.oddEvenSplit(totalPages);
                case REMOVE_FIRST -> PageOrderingUtils.removeFirst(totalPages);
                case REMOVE_LAST -> PageOrderingUtils.removeLast(totalPages);
                case REMOVE_FIRST_AND_LAST -> PageOrderingUtils.removeFirstAndLast(totalPages);
                case DUPLICATE -> duplicate(totalPages, pageOrder);
                default ->
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.invalidFormat",
                                "Invalid {0} format: {1}",
                                "custom mode",
                                "unsupported");
            };
        } catch (IllegalArgumentException e) {
            log.error("Unsupported custom mode", e);
            return null;
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rearrange-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Rearrange pages in a PDF file",
            description =
                    "This endpoint rearranges pages in a given PDF file based on the specified page"
                            + " order or custom mode. Users can provide a page order as a"
                            + " comma-separated list of page numbers or page ranges, or a custom mode."
                            + " Input:PDF Output:PDF")
    public ResponseEntity<Resource> rearrangePages(@ModelAttribute RearrangePagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        String pageOrder = request.getPageNumbers();
        String sortType = request.getCustomMode();
        try {
            // Load the input PDF with proper resource management
            try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {

                // Split the page order string into an array of page numbers or range of numbers
                String[] pageOrderArr = pageOrder != null ? pageOrder.split(",") : new String[0];
                int totalPages = document.getNumberOfPages();
                List<Integer> newPageOrder;
                if (sortType != null
                        && !sortType.isEmpty()
                        && !"custom".equals(sortType.toLowerCase(Locale.ROOT))) {
                    newPageOrder = processSortTypes(sortType, totalPages, pageOrder);
                } else {
                    newPageOrder = GeneralUtils.parsePageList(pageOrderArr, totalPages, false);
                }
                log.info("newPageOrder = {}", newPageOrder);
                log.info("totalPages = {}", totalPages);
                // Create a new list to hold the pages in the new order
                List<PDPage> newPages = new ArrayList<>();
                for (int i = 0; i < newPageOrder.size(); i++) {
                    newPages.add(document.getPage(newPageOrder.get(i)));
                }

                // Create a new document based on the original one
                try (PDDocument rearrangedDocument =
                        pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document)) {

                    // Add the pages in the new order
                    for (PDPage page : newPages) {
                        rearrangedDocument.addPage(page);
                    }

                    PDDocumentCatalog sourceCatalog = document.getDocumentCatalog();
                    if (sourceCatalog != null) {
                        PDAcroForm sourceForm = sourceCatalog.getAcroForm(null);
                        if (sourceForm != null) {
                            rearrangedDocument
                                    .getDocumentCatalog()
                                    .getCOSObject()
                                    .setItem(COSName.ACRO_FORM, sourceForm.getCOSObject());
                        }
                    }

                    return WebResponseUtils.pdfDocToWebResponse(
                            rearrangedDocument,
                            GeneralUtils.generateFilename(
                                    pdfFile.getOriginalFilename(), "_rearranged.pdf"),
                            tempFileManager);
                }
            }
        } catch (IOException e) {
            ExceptionUtils.logException("document rearrangement", e);
            throw e;
        }
    }
}
