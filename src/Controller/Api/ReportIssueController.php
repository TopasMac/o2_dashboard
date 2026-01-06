<?php

namespace App\Controller\Api;

use App\Service\ReportDataBuilder;
use Doctrine\ORM\EntityManagerInterface;
use Knp\Snappy\Pdf;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use App\Service\DocumentUploadService;
use App\Service\UploadRequestDTO;
use App\Entity\Unit;
use App\Entity\UnitBalanceLedger;

class ReportIssueController extends AbstractController
{
    #[Route('/api/reports/{unitId}/{yearMonth}/issue', name: 'api_report_issue', methods: ['POST'])]
    public function issueReport(
        int $unitId,
        string $yearMonth,
        ReportDataBuilder $builder,
        Pdf $pdf,
        EntityManagerInterface $em,
        DocumentUploadService $uploader
    ): Response {
        // Build report data
        $data = $builder->build($unitId, $yearMonth);

        // Ensure unit name is available
        $unitName = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '', $data['unit']['name'] ?? ('unit' . $unitId)));

        // Generate filename like singular111_monthreport_0825.pdf
        $monthTs  = strtotime($yearMonth . '-01');
        $fileName = sprintf('%s_monthreport_%s.pdf', $unitName, date('my', $monthTs));

        // Render Twig HTML
        $html = $this->renderView('reports/owner_report.pdf.twig', $data);

        // Prepare tmp path (prefer stable name, but allow re-issue by removing old file)
        $tmpDir  = sys_get_temp_dir();
        $tmpPath = $tmpDir . '/' . $fileName;
        if (file_exists($tmpPath)) {
            @unlink($tmpPath);
        }

        // Generate PDF into the tmp file
        $pdf->generateFromHtml($html, $tmpPath);

        // --- Create the ledger row via Doctrine ---
        $unit = $em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], Response::HTTP_NOT_FOUND);
        }

        $closingBalance = (float) ($data['meta']['closingBalance'] ?? 0.0);
        $today = new \DateTimeImmutable('today');
        $ymStr = $today->format('Y-m');
        $ref = sprintf('Reporte Mensual %s', date('my', $monthTs));

        $ledger = (new UnitBalanceLedger())
            ->setUnit($unit)
            ->setDate($today)
            ->setEntryType('REPORT_POSTING')
            ->setAmount($closingBalance)
            ->setPaymentMethod('report')
            ->setReference($ref)
            ->setNote(null)
            ->setCreatedBy('system');
        // If your entity has a yearMonth column/property, set it; otherwise remove this line
        if (method_exists($ledger, 'setYearMonth')) {
            $ledger->setYearMonth($ymStr);
        }

        $em->persist($ledger);
        $em->flush(); // ensures $ledger->getId() is available
        $ledgerId = (int) $ledger->getId();

        // --- Upload via DocumentUploadService (ledger attachment) ---
        $uploaded = null;
        try {
            $uploadedFile = new UploadedFile($tmpPath, $fileName, 'application/pdf', null, true);
            $dto = new UploadRequestDTO(
                unitId: $unitId,
                transactionId: $ledgerId,
                transactionType: 'ledger',
                category: 'REPORT',
                description: $ref,
                dateForName: new \DateTimeImmutable($ymStr . '-01'),
                file: $uploadedFile
            );
            $uploaded = $uploader->upload($dto);
        } finally {
            // Always remove tmp file once we attempted upload
            @unlink($tmpPath);
        }

        if ($uploaded && method_exists($ledger, 'addDocument')) {
            $ledger->addDocument($uploaded);
            $em->persist($ledger);
            $em->flush();
        }

        // Prefer publicUrl, fallback to documentUrl/s3Url
        $docPublicUrl = null;
        $docId = null;
        if ($uploaded) {
            $docId = method_exists($uploaded, 'getId') ? $uploaded->getId() : null;
            $docPublicUrl = method_exists($uploaded, 'getPublicUrl') ? $uploaded->getPublicUrl() : null;
            if (!$docPublicUrl && method_exists($uploaded, 'getDocumentUrl')) {
                $docPublicUrl = $uploaded->getDocumentUrl();
            }
            if (!$docPublicUrl && method_exists($uploaded, 'getS3Url')) {
                $docPublicUrl = $uploaded->getS3Url();
            }
        }

        return new JsonResponse([
            'filename'       => $fileName,
            'closingBalance' => $closingBalance,
            'unitId'         => $unitId,
            'yearMonth'      => $yearMonth,
            'ledgerId'       => $ledgerId,
            'documentId'     => $docId,
            'documentUrl'    => $docPublicUrl,
            'reference'      => $ref,
        ]);
    }
}