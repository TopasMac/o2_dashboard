<?php

namespace App\Service;

use Knp\Snappy\Pdf as SnappyPdf;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Twig\Environment as Twig;

class PdfRenderer
{
    private SnappyPdf $snappy;
    private Twig $twig;
    private Filesystem $fs;
    private string $publicDir;

    public function __construct(
        SnappyPdf $snappy,
        Twig $twig,
        Filesystem $fs,
        #[Autowire('%kernel.project_dir%')] string $projectDir
    ) {
        $this->snappy = $snappy;
        $this->twig   = $twig;
        $this->fs     = $fs;
        $this->publicDir = rtrim($projectDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'public';

        if (method_exists($this->snappy, 'setTimeout')) {
            $this->snappy->setTimeout(60);
        }
    }

    /**
     * Render a Twig body template to PDF, injecting header/footer via wkhtmltopdf --header-html/--footer-html.
     */
    public function renderAsPdf(
        string $bodyTemplate,
        array $bodyContext = [],
        array $options = [],
        array $chrome = []
    ): string {
        // Toggle: use wkhtml's external header/footer HTML, or keep them inline in the body template.
        // Default is false (inline header/footer inside body/base template).
        $useWkhtmlHeaderFooter = false;
        if (isset($options['use_wkhtml_header_footer'])) {
            $useWkhtmlHeaderFooter = (bool) $options['use_wkhtml_header_footer'];
            unset($options['use_wkhtml_header_footer']); // don't pass custom key to wkhtml
        }

        // Render header/footer partials to temp files only if we are using wkhtml header/footer
        $headerFile = null;
        $footerFile = null;

        if ($useWkhtmlHeaderFooter) {
            $hfContext  = $bodyContext + $chrome;

            // Provide defaults for header variables if not explicitly passed
            if (!isset($hfContext['locale'])) {
                $hfContext['locale'] = $bodyContext['locale'] ?? ($bodyContext['draft']['defaultLocale'] ?? 'en');
            }
            if (!isset($hfContext['header_label']) || $hfContext['header_label'] === '' || $hfContext['header_label'] === null) {
                $label = '';
                // Prefer explicit draft status if present
                if (isset($bodyContext['draft'])) {
                    $draft = $bodyContext['draft'];
                    // handle both array and object access
                    if (is_array($draft) && !empty($draft['status'])) {
                        $label = (string) $draft['status'];
                    } elseif (is_object($draft) && method_exists($draft, 'getStatus') && $draft->getStatus()) {
                        $label = (string) $draft->getStatus();
                    }
                }
                // Fallback to locale code
                if ($label === '' && isset($hfContext['locale'])) {
                    $label = strtoupper((string) $hfContext['locale']);
                }
                $hfContext['header_label'] = $label;
            }

            $headerHtml = $this->twig->render('pdf/_header.html.twig', $hfContext);
            $footerHtml = $this->twig->render('pdf/_footer.html.twig', $hfContext);

            $tmpDir     = sys_get_temp_dir();
            $headerFile = $this->uniqueTmpPath($tmpDir, 'hdr_', '.html');
            $footerFile = $this->uniqueTmpPath($tmpDir, 'ftr_', '.html');

            $this->fs->dumpFile($headerFile, $this->rewriteLocalAssets($headerHtml));
            $this->fs->dumpFile($footerFile, $this->rewriteLocalAssets($footerHtml));
        }

        // Render body HTML and rewrite local assets (so wkhtmltopdf can read them from file://)
        $bodyHtml = $this->twig->render($bodyTemplate, $bodyContext);
        $bodyHtml = $this->rewriteLocalAssets($bodyHtml);

        // Sensible defaults; options passed in can override any of these
        // When using inline (in-body) header/footer, keep wkhtml header/footer disabled.
        $defaults = [
            'print-media-type'         => true,
            'enable-local-file-access' => true,
            'encoding'                 => 'UTF-8',
            'dpi'                      => 96,
            'page-size'                => 'A4',
            'viewport-size'            => '1280x1024',
            'quiet'                    => true,
            'load-error-handling'      => 'ignore',
            'javascript-delay'         => 150,
            'no-stop-slow-scripts'     => true,
            // Default margins in mm tuned for inline base header/footer
            'margin-top'               => 24, // increased for header height
            'margin-bottom'            => 18,
            'margin-left'              => 12,
            'margin-right'             => 12,
            'header-line'              => false,
            'footer-line'              => false,
        ];

        if ($useWkhtmlHeaderFooter) {
            // Enable wkhtml header/footer; allow caller to override spacing if desired.
            // Keep conservative spacing; margins may be adjusted by caller for specific templates.
            $defaults['header-html']    = $headerFile ? ('file://' . $headerFile) : null;
            $defaults['footer-html']    = $footerFile ? ('file://' . $footerFile) : null;
            $defaults['header-spacing'] = $defaults['header-spacing'] ?? 0;
            $defaults['footer-spacing'] = $defaults['footer-spacing'] ?? 0;
        }

        $opts = $options + $defaults; // caller-provided options take precedence

        // DEBUG: dump effective options and rendered HTML to var/
        try {
            $varDir = dirname($this->publicDir) . DIRECTORY_SEPARATOR . 'var';
            if (!is_dir($varDir)) { @mkdir($varDir, 0775, true); }
            $this->fs->dumpFile($varDir . '/owners2_wkhtml_opts.json', json_encode($opts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            $this->fs->dumpFile($varDir . '/owners2_last.html', $bodyHtml);
            error_log('[Owners2] PdfRenderer renderAsPdf() invoked; options dumped to var/.');
        } catch (\Throwable $e) {
            // ignore debug write failures
        }

        try {
            return $this->snappy->getOutputFromHtml($bodyHtml, $opts);
        } finally {
            // Clean up temp files
            if ($headerFile) { @unlink($headerFile); }
            if ($footerFile) { @unlink($footerFile); }
        }
    }

    /**
     * Create a unique temp path with desired suffix.
     */
    private function uniqueTmpPath(string $dir, string $prefix, string $suffix): string
    {
        $base = tempnam($dir, $prefix);
        if ($base === false) {
            $base = $dir . DIRECTORY_SEPARATOR . $prefix . bin2hex(random_bytes(6));
        }
        $target = $base . $suffix;
        if (file_exists($base)) {
            @rename($base, $target);
        }
        return $target;
    }

    /**
     * Rewrites /img, /css, etc. to file:// absolute paths in public/ so wkhtmltopdf can load them offline.
     */
    private function rewriteLocalAssets(string $html): string
    {
        $pub = rtrim($this->publicDir, DIRECTORY_SEPARATOR);

        $skip = function (string $v): bool {
            $v = strtolower($v);
            return str_starts_with($v, 'http://') ||
                   str_starts_with($v, 'https://') ||
                   str_starts_with($v, 'data:') ||
                   str_starts_with($v, 'file://') ||
                   str_starts_with($v, '#');
        };

        $rewrite = function (string $attr, array $m) use ($pub, $skip): string {
            $val = $m[2] ?? '';
            if ($skip($val)) { return $m[0]; }
            if (str_starts_with($val, '/')) {
                $path = $pub . $val;
                if (@is_file($path)) {
                    return sprintf(' %s="%s"', $attr, 'file://' . $path);
                }
            }
            return $m[0];
        };

        // src="..."
        $html = preg_replace_callback('#\s(src)=["\']([^"\']+)["\']#i', fn($m) => $rewrite('src', $m), $html);
        // href="..."
        $html = preg_replace_callback('#\s(href)=["\']([^"\']+)["\']#i', fn($m) => $rewrite('href', $m), $html);

        return $html;
    }
}