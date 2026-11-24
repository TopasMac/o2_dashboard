<?php
namespace App\Tests\Controller;

use PHPUnit\Framework\TestCase;
use Twig\Environment;
use Twig\Loader\FilesystemLoader;
use Symfony\Bridge\Twig\Extension\TranslationExtension;
use Symfony\Component\Translation\Translator;
use App\Twig\CleaningDescriptionExtension;

final class CleaningReportRenderingTest extends TestCase
{
    public function testClientReportRendersCleaningDescriptionsInItsLanguage(): void
    {
        $twig = new Environment(new FilesystemLoader(dirname(__DIR__, 2).'/templates'));
        $twig->addExtension(new TranslationExtension(new Translator('es')));
        $twig->addExtension(new CleaningDescriptionExtension());
        $payload = [
            'meta' => ['language' => 'es'],
            'unit' => ['unitName' => 'Synthetic unit'],
            'client' => ['name' => 'Synthetic client'],
            'housekeeping' => ['rows' => [
                ['date' => '2026-11-24', 'categoryId' => 8, 'categoryName' => 'Limpieza_extra', 'description' => 'Sofa cleaning', 'charged' => 100],
                ['date' => '2026-11-24', 'categoryId' => 8, 'categoryName' => 'Limpieza_extra', 'description' => 'Deep cleaning', 'charged' => 200],
            ]],
        ];
        $spanish = $twig->render('reports_v2/unit_report.pdf.twig', $payload);
        self::assertStringContainsString('Limpieza sofa', $spanish);
        self::assertStringContainsString('Limpieza profunda', $spanish);
        self::assertStringNotContainsString('Sofa cleaning', $spanish);
        $payload['meta']['language'] = 'en';
        $english = $twig->render('reports_v2/unit_report.pdf.twig', $payload);
        self::assertStringContainsString('Sofa cleaning', $english);
        self::assertStringContainsString('Deep cleaning', $english);
    }
}
