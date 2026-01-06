<?php

namespace App\Dto;

use Symfony\Component\Serializer\Annotation\Groups;

/**
 * One row in the expected payments report.
 */
class ExpectedPaymentsRow
{
    #[Groups(['expected_payments:read'])]
    public ?int $unitId = null;

    #[Groups(['expected_payments:read'])]
    public ?string $unitName = null;

    /** Service label per row (e.g., "HOA"). */
    #[Groups(['expected_payments:read'])]
    public ?string $servicio = null;

    #[Groups(['expected_payments:read'])]
    public ?string $provider = null;

    // HOA-specific fields

    #[Groups(['expected_payments:read'])]
    public ?string $banco = null;

    #[Groups(['expected_payments:read'])]
    public ?string $nombre = null;

    #[Groups(['expected_payments:read'])]
    public ?string $cuenta = null;

    #[Groups(['expected_payments:read'])]
    public ?string $hoaEmail = null;

    #[Groups(['expected_payments:read'])]
    public ?string $hoa_amount = null;

    #[Groups(['expected_payments:read'])]
    public ?string $amount = null;

    // Payment info

    #[Groups(['expected_payments:read'])]
    public ?string $monto = null;

    #[Groups(['expected_payments:read'])]
    public ?string $fechaPagoIso = null;

    #[Groups(['expected_payments:read'])]
    public ?string $fechaPago = null;

    #[Groups(['expected_payments:read'])]
    public ?int $sortTs = null;

    public function __construct(
        ?int $unitId = null,
        ?string $unitName = null,
        ?string $servicio = null,
        ?string $banco = null,
        ?string $nombre = null,
        ?string $cuenta = null,
        ?string $hoaEmail = null,
        ?string $monto = null,
        ?string $hoaAmount = null,
        ?string $fechaPagoIso = null,
        ?string $fechaPago = null,
        ?int $sortTs = null,
    ) {
        $this->unitId = $unitId;
        $this->unitName = $unitName;
        $this->servicio = $servicio;
        $this->banco = $banco;
        $this->provider = $banco;
        $this->nombre = $nombre;
        $this->cuenta = $cuenta;
        $this->hoaEmail = $hoaEmail;
        $this->monto = $monto;
        $this->hoa_amount = $hoaAmount;
        $this->amount = $hoaAmount ?? $monto;
        $this->fechaPagoIso = $fechaPagoIso;
        $this->fechaPago = $fechaPago;
        $this->sortTs = $sortTs;
    }

    public function getBanco(): ?string { return $this->banco; }
    public function getProvider(): ?string { return $this->provider ?? $this->banco; }
    public function getNombre(): ?string { return $this->nombre; }
    public function getCuenta(): ?string { return $this->cuenta; }
    public function getHoaAmount(): ?float { return $this->hoa_amount !== null ? (float)$this->hoa_amount : null; }
    public function getAmount(): float
    {
        $val = $this->hoa_amount ?? $this->monto ?? $this->amount;
        return $val !== null ? (float)$val : 0.0;
    }
    public function getUnitName(): ?string { return $this->unitName; }
    public function getServicio(): ?string { return $this->servicio; }
    public function getFechaPago(): ?string { return $this->fechaPago; }
    public function getFechaPagoIso(): ?string { return $this->fechaPagoIso; }
}