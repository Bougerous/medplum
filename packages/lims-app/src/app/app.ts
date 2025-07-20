import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: true,
  imports: [RouterModule],
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('lims-app');
}
