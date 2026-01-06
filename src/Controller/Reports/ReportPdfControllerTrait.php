<?php
namespace App\Controller\Reports;

use Knp\Snappy\Pdf;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;

trait ReportPdfControllerTrait
{
    private function renderTmp(string $tpl, array $ctx): string {
        $html = $this->renderView($tpl, $ctx);
        $tmp = tempnam(sys_get_temp_dir(), 'o2pdf_').'.html';
        file_put_contents($tmp, $html);
        return $tmp;
    }

    private function renderHeaderTmp(array $ctx = []): string
    {
        // Build an absolute file:// URL to the logo; wkhtmltopdf needs a resolvable local path
        $projectDir = $this->getParameter('kernel.project_dir');
        $logoFsPath = rtrim($projectDir, '/').'/public/logo_full_green.png';
        $logoUrl = is_file($logoFsPath) ? ('file://'.$logoFsPath) : '/logo_full_green.png';

        $defaults = [
            'logo_url'    => $logoUrl,
            'right_label' => '',
        ];

        return $this->renderTmp('reports/pdf/partials/header.html.twig', array_replace($defaults, $ctx));
    }

    private function renderFooterTmp(array $ctx = []): string
    {
        // Provide sensible defaults; footer partial can read these
        $defaults = [
            'left_label'  => '',      // e.g., report name
            'right_label' => '',      // e.g., unit or date
            // Page numbers are usually handled in the Twig via counters, but
            // context keys are here in case you want to customize text.
        ];
        return $this->renderTmp('reports/pdf/partials/footer.html.twig', array_replace($defaults, $ctx));
    }

    private function toFileUrl(string $path): string
    {
        // Ensure wkhtmltopdf receives a file:// URL
        if (str_starts_with($path, 'file://')) {
            return $path;
        }
        if ($path === '' || $path[0] !== '/') {
            $resolved = realpath($path);
            if ($resolved !== false) {
                $path = $resolved;
            }
        }
        return 'file://' . $path;
    }

    /** Returns standard A4 options + header/footer with safe spacing for wkhtmltopdf */
    private function a4PdfOptions(string $headerTmp, string $footerTmp): array
    {
        return [
            'page-size'               => 'A4',
            // Room for header/footer; body margins slightly tighter on sides
            'margin-top'              => '22mm',
            'margin-bottom'           => '18mm',
            'margin-left'             => '12mm',
            'margin-right'            => '12mm',
            'header-html'             => $this->toFileUrl($headerTmp),
            'footer-html'             => $this->toFileUrl($footerTmp),
            // Add a bit of spacing so content doesn't collide with rules in the partials
            'header-spacing'          => '6',
            'footer-spacing'          => '6',
            'encoding'                => 'UTF-8',
            'print-media-type'        => true,
            'enable-local-file-access'=> true,
            // Keep output quiet/stable
            'quiet'                   => true,
            'dpi'                     => 96,
        ];
    }
}