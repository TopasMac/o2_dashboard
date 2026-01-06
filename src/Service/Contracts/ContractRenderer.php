<?php

namespace App\Service\Contracts;

use App\Entity\ContractDraft;
use Symfony\Contracts\Translation\TranslatorInterface;
use Symfony\Component\Translation\Translator;
use Symfony\Component\Translation\Loader\ArrayLoader;
use Twig\Environment as TwigEnvironment;

class ContractRenderer
{
    private TwigEnvironment $twig;
    private TranslatorInterface $translator;

    public function __construct(TwigEnvironment $twig, TranslatorInterface $translator)
    {
        $this->twig = $twig;
        $this->translator = $translator;
    }

    /**
     * Render a draft contract to HTML with runtime overrides.
     *
     * @param ContractDraft $draft
     * @param string        $lang   'en' or 'es'
     * @return string HTML output
     */
    public function renderHtml(ContractDraft $draft, string $lang = 'en'): string
    {
        $fields = $draft->getFields();

        // Build structured objects expected by Twig templates
        $client = [
            'name'     => $draft->getClientName(),
            'phone'    => $fields['ownerPhone']    ?? null,
            'email'    => $fields['ownerEmail']    ?? null,
            'idNumber' => $fields['ownerIdNumber'] ?? null,
        ];

        $unit = [
            'name'    => $draft->getUnitName(),
            'address' => $fields['address'] ?? null,
        ];

        // Static company defaults (can be moved to config/DB later)
        $company = [
            'name'           => 'Owners2',
            'legalName'      => 'Owners2 Property Management',
            'representative' => 'António Pedro Tarana de Macedo',
            'phone'          => '+52 984 142 9561',
            'email'          => 'admin@owners2.com',
        ];

        $context = [
            'lang'         => $lang,
            'overrides_en' => $draft->getOverridesEn() ?? [],
            'overrides_es' => $draft->getOverridesEs() ?? [],

            // structured objects used by templates
            'client'   => $client,
            'unit'     => $unit,
            'company'  => $company,

            // raw fields map (for direct access like contract.*)
            'contract' => $fields,

            // legacy/simple fields still available
            'clientName' => $draft->getClientName(),
            'unitName'   => $draft->getUnitName(),
            'notes'      => $draft->getNotes(),
        ];

        // Pick template by language
        $template = $lang === 'es'
            ? 'pdf/contracts/contract_es_html.twig'
            : 'pdf/contracts/contract_en_html.twig';

        return $this->twig->render($template, $context);
    }
}