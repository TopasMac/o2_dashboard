<?php

declare(strict_types=1);

namespace App\Service\Reports;

final class CleaningDescriptionTranslator
{
    public static function translate(?string $description, mixed $categoryId, ?string $language): string
    {
        $description ??= '';
        if ((int) $categoryId !== 8 || !in_array(strtolower(trim($language ?? '')), ['es', 'es-mx', 'es_mx', 'spanish', 'español'], true)) {
            return $description;
        }
        $key = strtolower(trim($description));
        // HK Cleanings produces descriptions such as "Initial cleaning";
        // Service Job allocations store the selected type as the description.
        return match ($key) {
            'initial', 'initial cleaning' => 'Limpieza inicial',
            'mid-stay', 'midstay', 'mid-stay cleaning', 'midstay cleaning' => 'Estancia',
            'redo', 'redo cleaning' => 'Rehacer',
            'refresh', 'refresh cleaning' => 'Repaso',
            'other', 'other cleaning' => 'Otra limpieza',
            'sofa cleaning' => 'Limpieza sofa',
            'deep cleaning' => 'Limpieza profunda',
            default => $description,
        };
    }
}
