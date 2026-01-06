<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;
use Symfony\Component\Routing\Loader\Configurator\RoutingConfigurator;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;
use Symfony\Component\Config\Loader\LoaderInterface;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\Config\FileLocator;
use Symfony\Component\DependencyInjection\Loader\YamlFileLoader;

class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    protected function configureContainer(ContainerConfigurator $container): void
    {
        $confDir = $this->getProjectDir() . '/config';

        $container->import($confDir . '/packages/*.yaml');

        if (is_dir($confDir . '/packages/' . $this->environment)) {
            foreach (glob($confDir . '/packages/' . $this->environment . '/*.yaml') as $file) {
                try {
                    $container->import($file);
                } catch (\Throwable $e) {
                    // skip files with missing extensions
                }
            }
        }

        $container->import($confDir . '/services.yaml');

        $envServices = $confDir . '/services_' . $this->environment . '.yaml';
        if (is_file($envServices)) {
            try {
                $container->import($envServices);
            } catch (\Throwable $e) {
                // skip files with missing extensions
            }
        }
    }

    protected function configureRoutes(RoutingConfigurator $routes): void
    {
        $confDir = $this->getProjectDir() . '/config';

        $routes->import($confDir . '/routes/*.yaml');

        if (is_dir($confDir . '/routes/' . $this->environment)) {
            try {
                $routes->import($confDir . '/routes/' . $this->environment . '/*.yaml');
            } catch (\Throwable $e) {
                // skip routes referencing missing bundles
            }
        }

        $routes->import($confDir . '/routes.yaml');
    }
}
