<?php

namespace App\Service;

use App\Entity\AllBookings;
use App\Entity\Unit;
use App\Entity\BookingConfig;

class BookingCalculatorService
{
    public function recalculate(AllBookings $booking, ?Unit $unit, BookingConfig $config): AllBookings
    {
        // Ensure required numeric fields are initialized to defaults if null
        if ($booking->getDays() === null) {
            $booking->setDays(0);
        }
        if ($booking->getStatus() === null) {
            $booking->setStatus('Upcoming');
        }
        if ($booking->getPayout() === null) {
            $booking->setPayout(0);
        }
        if ($booking->getTaxPercent() === null) {
            $booking->setTaxPercent(0);
        }
        if ($booking->getTaxAmount() === null) {
            $booking->setTaxAmount(0);
        }
        if ($booking->getNetPayout() === null) {
            $booking->setNetPayout(0);
        }
        if ($booking->getCleaningFee() === null) {
            $booking->setCleaningFee(0);
        }
        if ($booking->getCommissionPercent() === null) {
            $booking->setCommissionPercent(0);
        }
        if ($booking->getCommissionValue() === null) {
            $booking->setCommissionValue(0);
        }
        if ($booking->getClientIncome() === null) {
            $booking->setClientIncome(0);
        }
        if ($booking->getO2Total() === null) {
            $booking->setO2Total(0);
        }
        if ($booking->getRoomFee() === null) {
            $booking->setRoomFee(0);
        }
        $isCancelled = (strcasecmp($booking->getStatus() ?? '', 'Cancelled') === 0);
        $payout = $booking->getPayout() ?? 0;
        $cleaningFee = $booking->getCleaningFee() ?? ($unit ? $unit->getCleaningFee() : 0);
        $commissionPercent = $booking->getCommissionPercent() ?? $config->getDefaultCommissionPercentage();

        if ($isCancelled) {
            // Zero fees for cancelled bookings, keep payout as-is (may be residual)
            $cleaningFee = 0;
            $booking->setCleaningFee(0);
        }

        $checkIn = $booking->getCheckIn();
        $checkOut = $booking->getCheckOut();
        $days = $checkIn && $checkOut ? $checkIn->diff($checkOut)->days : 0;

        if ($isCancelled) {
            // Preserve tax values exactly as entered before cancellation
            $taxPercent = $booking->getTaxPercent() ?? 0;
            $taxAmount  = $booking->getTaxAmount() ?? 0;
            $netPayout  = $payout - $taxAmount;

            // Standardized commission math
            $commissionBase = round(max(0, $netPayout - $cleaningFee), 2); // cleaningFee is 0 here
            $commissionValue = round($commissionBase * ($commissionPercent / 100), 2);

            if ($unit && $unit->getPaymentType() === 'Client') {
                // Client units: we only bill; clientIncome stays 0; we charge commission + cleaning (cleaning is 0 here)
                $clientIncome = 0;
                $o2Total      = $commissionValue + $cleaningFee;
            } else {
                // Owners2 units: client income is net minus our commission and cleaning
                $clientIncome = $netPayout - $cleaningFee - $commissionValue;
                $o2Total      = $commissionValue + $cleaningFee;
            }

            // Room fee is 0 for cancelled bookings
            $roomFee = 0;

            $booking->setTaxPercent($taxPercent)
                ->setTaxAmount($taxAmount)
                ->setNetPayout($netPayout)
                ->setCommissionBase($commissionBase)
                ->setCommissionValue($commissionValue)
                ->setClientIncome($clientIncome)
                ->setO2Total($o2Total)
                ->setRoomFee($roomFee);

            // Status remains Cancelled
            $booking->setStatus('Cancelled');

            return $booking;
        }

        $taxPercent = $config->getDefaultTaxPercentage();
        $taxAmount = 0;
        $netPayout = $payout;
        $commissionValue = 0;
        $clientIncome = 0;
        $o2Total = 0;
        $commissionBase = 0;

        // Special logic for Owner "no_pay" method
        if ($booking->getPaymentMethod() === 'no_pay') {
            $payout = 0;
            $taxPercent = 0;
            $taxAmount = 0;
            $netPayout = 0;
            $commissionValue = 0;
            $commissionBase = 0;
            $clientIncome = -$cleaningFee;
            $o2Total = $cleaningFee;
        } elseif ($unit && $unit->getPaymentType() === 'Client') {
            // Client logic
            if ($booking->getSource() === 'Airbnb') {
                // Airbnb - client collects
                $taxPercent = 0;
                $taxAmount = 0;
                $netPayout = $payout;

                $commissionBase  = round(max(0, $netPayout - $cleaningFee), 2);
                $commissionValue = round($commissionBase * ($commissionPercent / 100), 2);
                $clientIncome = 0; // Client already collects, we only bill
                $o2Total = $commissionValue + $cleaningFee;
            } elseif ($booking->getSource() === 'Private') {
                // Private - Owners2 collects on behalf of client
                if ($booking->getPaymentMethod() === 'card') {
                    $taxPercent = $config->getDefaultTaxPercentage();
                } else {
                    // cash
                    $taxPercent = 0;
                }
                $taxAmount = $payout * ($taxPercent / 100);
                $netPayout = $payout - $taxAmount;

                $commissionBase  = round(max(0, $netPayout - $cleaningFee), 2);
                $commissionValue = round($commissionBase * ($commissionPercent / 100), 2);
                $clientIncome = $netPayout - $cleaningFee - $commissionValue;
                $o2Total = $commissionValue + $cleaningFee;
            }
        } else {
            // Owners2 logic (default)
            $taxAmount = $payout * ($taxPercent / 100);
            $netPayout = $payout - $taxAmount;

            $commissionBase  = round(max(0, $netPayout - $cleaningFee), 2);
            $commissionValue = round($commissionBase * ($commissionPercent / 100), 2);
            $clientIncome = $netPayout - $cleaningFee - $commissionValue;
            $o2Total = $commissionValue + $cleaningFee;
        }

        // Room fee: (payout - cleaningFee) / days, but 0 if Owner (no_pay)
        if ($isCancelled) {
            $roomFee = 0;
        } elseif ($booking->getPaymentMethod() === 'no_pay') {
            $roomFee = 0;
        } else {
            $roomFee = $days > 0 ? ($payout - $cleaningFee) / $days : 0;
        }

        $booking->setTaxPercent($taxPercent)
            ->setTaxAmount($taxAmount)
            ->setNetPayout($netPayout)
            ->setCommissionBase($commissionBase)
            // ->setCommissionPercent($commissionPercent) // Removed redundant assignment
            ->setCommissionValue($commissionValue)
            ->setClientIncome($clientIncome)
            ->setO2Total($o2Total)
            ->setRoomFee($roomFee);

        // Update status based on dates
        if (!$isCancelled) {
            $now = new \DateTime();
            if ($checkOut && $checkOut < $now) {
                $booking->setStatus('Past');
            } elseif ($checkIn && $checkIn > $now) {
                $booking->setStatus('Upcoming');
            } else {
                $booking->setStatus('Ongoing');
            }
        } else {
            $booking->setStatus('Cancelled');
        }

        return $booking;
    }

    public function calculate(AllBookings $booking, ?Unit $unit, BookingConfig $config): AllBookings
    {
        return $this->recalculate($booking, $unit, $config);
    }
}
