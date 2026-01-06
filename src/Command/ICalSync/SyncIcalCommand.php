<?php

namespace App\Command\ICalSync;

use App\Repository\UnitRepository;
use App\Service\ICal\IcalSyncService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'app:sync-ical', description: 'Sync iCal feeds for all units with an Airbnb iCal URL')]
class SyncIcalCommand extends Command
{
    public function __construct(
        private UnitRepository $unitRepo,
        private IcalSyncService $icalSyncService,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $units = $this->unitRepo->createQueryBuilder('u')
            ->andWhere('u.airbnbIcal IS NOT NULL AND u.airbnbIcal <> :empty')
            ->setParameter('empty', '')
            ->getQuery()
            ->getResult();

        $updatedTotal = 0;
        $errorTotal   = 0;

        if (!$units) {
            $output->writeln('<comment>No units found with an Airbnb iCal URL.</comment>');
            return Command::SUCCESS;
        }

        foreach ($units as $unit) {
            $output->writeln(sprintf('<info>Syncing Unit #%d (%s)</info>', $unit->getId(), $unit->getUnitName() ?? 'Unnamed'));

            try {
                $res = $this->icalSyncService->syncUnit($unit);
                if ($res['ok'] ?? false) {
                    $count = $res['count'] ?? 0;
                    $updatedTotal += (int) $count;
                    $output->writeln(sprintf(' → OK: %d events updated', $count));
                } else {
                    $errorTotal++;
                    $output->writeln(sprintf(' → Error: %s', $res['reason'] ?? 'unknown'));
                }
            } catch (\Throwable $e) {
                $output->writeln(sprintf('<error> → Exception: %s</error>', $e->getMessage()));
                $errorTotal++;
            }
        }

        $output->writeln('<info>iCal sync completed.</info>');

        // Write a small marker file with last run info (UTC)
        try {
            $projectRoot = \dirname(__DIR__, 3);
            $metricsDir  = $projectRoot . '/var/metrics';
            if (!is_dir($metricsDir)) {
                @mkdir($metricsDir, 0775, true);
            }
            $nowUtc    = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
            $localTz   = new \DateTimeZone('America/Cancun');
            $nowLocal  = $nowUtc->setTimezone($localTz);

            $payload = [
                // Always keep a canonical UTC field
                'lastRunAt'           => $nowUtc->format(DATE_ATOM),
                // Provide a local-time convenience for Playa del Carmen (America/Cancun)
                'lastRunAtLocal'      => $nowLocal->format('Y-m-d\TH:i:sP'),
                'lastRunAtLocalTz'    => 'America/Cancun',
                'unitsConsidered'     => is_countable($units) ? count($units) : 0,
                'eventsUpdated'       => $updatedTotal,
                'errors'              => $errorTotal,
                'ok'                  => true,
            ];
            @file_put_contents($metricsDir . '/ical_sync_last_run.json', json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            $output->writeln(sprintf('<comment>Saved metrics → %s</comment>', $metricsDir . '/ical_sync_last_run.json'));
        } catch (\Throwable $e) {
            // Non-fatal
            $output->writeln(sprintf('<comment>Could not write metrics file: %s</comment>', $e->getMessage()));
        }

        return Command::SUCCESS;
    }
}
