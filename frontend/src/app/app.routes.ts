import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'research' },
  { path: 'research', title: 'Research Analytics | AeroLab AI', loadComponent: () => import('./research').then((m) => m.ResearchPage) },
  { path: 'demo', title: 'NASA Airfoil Demo | AeroLab AI', loadComponent: () => import('./demo').then((m) => m.DemoPage) },
  { path: '**', redirectTo: 'research' },
];
