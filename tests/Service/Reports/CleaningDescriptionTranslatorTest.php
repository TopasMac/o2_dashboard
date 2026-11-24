<?php
namespace App\Tests\Service\Reports;

use App\Service\Reports\CleaningDescriptionTranslator;
use App\Twig\CleaningDescriptionExtension;
use PHPUnit\Framework\TestCase;
use Twig\Environment;
use Twig\Loader\ArrayLoader;

final class CleaningDescriptionTranslatorTest extends TestCase
{
    public function testKnownCleaningDescriptionsAreTranslatedOnlyForSpanishAndCategoryEight(): void
    {
        $translations = ['Initial' => 'Limpieza inicial', 'Mid-stay' => 'Estancia', 'Redo' => 'Rehacer', 'Refresh' => 'Repaso', 'Other' => 'Otra limpieza', 'Sofa cleaning' => 'Limpieza sofa', 'Deep cleaning' => 'Limpieza profunda', 'Initial cleaning' => 'Limpieza inicial', 'Mid-stay cleaning' => 'Estancia', 'Refresh cleaning' => 'Repaso', 'Redo cleaning' => 'Rehacer'];
        foreach ($translations as $english => $spanish) {
            self::assertSame($spanish, CleaningDescriptionTranslator::translate($english, 8, 'es'));
            self::assertSame($english, CleaningDescriptionTranslator::translate($english, 8, 'en'));
            self::assertSame($english, CleaningDescriptionTranslator::translate($english, 2, 'es'));
        }
        self::assertSame('Custom cleaning instructions', CleaningDescriptionTranslator::translate('Custom cleaning instructions', 8, 'es'));
        self::assertSame('Limpieza profunda', CleaningDescriptionTranslator::translate('Deep cleaning', '8', 'es-MX'));
        self::assertSame('Limpieza sofa', CleaningDescriptionTranslator::translate('Sofa cleaning', 8, 'Spanish'));
    }

    public function testTwigUsesReportLanguageAndEscapesUnknownDescriptions(): void
    {
        $twig = new Environment(new ArrayLoader(['report' => '{{ description|cleaning_description(category, language) }}']), ['autoescape' => 'html']);
        $twig->addExtension(new CleaningDescriptionExtension());
        self::assertSame('Limpieza sofa', $twig->render('report', ['description' => 'Sofa cleaning', 'category' => 8, 'language' => 'es']));
        self::assertSame('Sofa cleaning', $twig->render('report', ['description' => 'Sofa cleaning', 'category' => 8, 'language' => 'en']));
        self::assertSame('&lt;b&gt;Custom&lt;/b&gt;', $twig->render('report', ['description' => '<b>Custom</b>', 'category' => 8, 'language' => 'es']));
    }
}
