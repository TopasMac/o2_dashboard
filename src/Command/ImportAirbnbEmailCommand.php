<?php

namespace App\Command;

use App\Entity\AirbnbEmailImport;
use App\Service\BookingProcessingService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:import-airbnb-email',
    description: 'Imports Airbnb email data from a .eml file',
)]
class ImportAirbnbEmailCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private BookingProcessingService $bookingProcessor;

    public function __construct(EntityManagerInterface $entityManager, BookingProcessingService $bookingProcessor)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->bookingProcessor = $bookingProcessor;
    }

    protected function configure(): void
    {
        $this
            ->addArgument('filepath', InputArgument::REQUIRED, 'Path to the .eml file');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $filePath = $input->getArgument('filepath');
        if (!file_exists($filePath)) {
            $io->error('EML file not found at ' . $filePath);
            return Command::FAILURE;
        }

        $content = file_get_contents($filePath);

        $lines = explode("\n", $content);

        // Extract confirmation code (line below "CONFIRMATION CODE")
        $reservationCode = null;
        foreach ($lines as $index => $line) {
            if (strpos(trim($line), 'CONFIRMATION CODE') === 0 && isset($lines[$index + 1])) {
                $codeLine = trim($lines[$index + 1]);
                if (!empty($codeLine)) {
                    $reservationCode = $codeLine;
                    break;
                }
            }
        }

        preg_match('/^Subject: (.+)$/mi', $content, $subjectMatch);
        $subject = $subjectMatch[1] ?? '';

        $guestName = null;
        if (preg_match('/Reservation confirmed - (.+?) arrives/i', $subject, $match)) {
            $guestName = trim($match[1]);
        }

        // Extract Listing Name (2 lines above "Entire home/flat")
        $listingName = null;
        foreach ($lines as $index => $line) {
            if (strpos($line, 'Entire home/flat') !== false && $index >= 2) {
                $possibleName = trim($lines[$index - 2]);
                if (!empty($possibleName)) {
                    $listingName = $possibleName;
                    break;
                }
            }
        }
        // Extract guests (line 2 after "GUESTS")
        $guests = null;
        foreach ($lines as $index => $line) {
            if (strpos(trim($line), 'GUESTS') === 0 && isset($lines[$index + 2])) {
                $guestLine = trim($lines[$index + 2]);
                if (preg_match('/^(\d+)/', $guestLine, $match)) {
                    $guests = $match[1];
                    break;
                }
            }
        }
        // Extract check-in and check-out dates with dynamic month
        $checkIn = null;
        $checkOut = null;
        if (preg_match('/Check-in\s+Checkout\s*\n.*?\n\w+\s+(\d+)\s+(\w+)\s+\w+\s+(\d+)\s+\w+/i', $content, $dateMatch)) {
            $checkIn = $dateMatch[1] . ' ' . $dateMatch[2]; // e.g. "20 Jun"
            $checkOut = $dateMatch[3] . ' ' . $dateMatch[2]; // e.g. "26 Jun"
        }
        $io->note("Extracted Check-in: " . var_export($checkIn, true));
        $io->note("Extracted Check-out: " . var_export($checkOut, true));
        $payout = $this->match('/YOU EARN\s+\$?([0-9.,]+)/i', $content);
        $cleaningFee = $this->match('/Cleaning fee\s+\$?([0-9.,]+)/i', $content);
        // Extract room fee from GUEST PAID section only (skip empty line after and match next one)
        $roomFee = null;
        for ($i = 0; $i < count($lines); $i++) {
            if (stripos(trim($lines[$i]), 'GUEST PAID') !== false) {
                $seenGuestPaid = true;
                for ($j = $i + 1; $j < count($lines); $j++) {
                    $trimmedLine = trim($lines[$j]);
                    if ($trimmedLine === '') {
                        continue; // skip empty lines
                    }
                    if (preg_match('/\$([0-9.,]+)\s*x\s+\d+\s+nights?/i', $trimmedLine, $matches)) {
                        $roomFee = $matches[1];
                    }
                    break;
                }
                break;
            }
        }

        if (!$reservationCode) {
            $io->error('Could not extract reservation code. Aborting.');
            return Command::FAILURE;
        }

        $record = new AirbnbEmailImport();
        $record->setBookingDate(new \DateTime()); // current timestamp for now
        $record->setSource("Airbnb");
        $record->setConfirmationCode($reservationCode);
        $record->setGuestName($guestName ?? '');
        $record->setListingName($listingName);
        $record->setGuests($guests);
        $io->note("Check-in raw value: " . var_export($checkIn, true));
        $record->setCheckIn($checkIn);
        $io->note("Check-out raw value: " . var_export($checkOut, true));
        $record->setCheckOut($checkOut);
        $payout = $payout !== null ? (float) str_replace(',', '', $payout) : null;
        $record->setPayout($payout);
        $cleaningFee = $cleaningFee !== null ? (float) str_replace(',', '', $cleaningFee) : null;
        $record->setCleaningFee($cleaningFee);
        $roomFee = $roomFee !== null ? (float) str_replace(',', '', $roomFee) : null;
        $record->setRoomFee($roomFee);

        $this->entityManager->persist($record);
        $this->entityManager->flush();

        $this->bookingProcessor->processAirbnbEmails();

        $io->success("Email imported successfully: $reservationCode");
        $io->success("Parsing triggered.");

        return Command::SUCCESS;
    }

    private function match(string $pattern, string $content): ?string
    {
        if (preg_match($pattern, $content, $matches)) {
            return trim(str_replace('$', '', $matches[1]));
        }
        return null;
    }
}
