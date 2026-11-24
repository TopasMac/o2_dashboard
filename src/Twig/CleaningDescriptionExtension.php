<?php

declare(strict_types=1);

namespace App\Twig;

use Twig\Extension\AbstractExtension;
use Twig\TwigFilter;

final class CleaningDescriptionExtension extends AbstractExtension
{
    public function getFilters(): array
    {
        return [new TwigFilter('cleaning_description', \App\Service\Reports\CleaningDescriptionTranslator::translate(...))];
    }

}
