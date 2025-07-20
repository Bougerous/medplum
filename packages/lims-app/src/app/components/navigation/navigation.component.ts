import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { NavigationItem, RoleService } from '../../services/role.service';
import { UserProfile } from '../../types/fhir-types';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="navigation" *ngIf="currentUser">
      <div class="nav-header">
        <h2>LIMS</h2>
        <div class="user-info">
          <span class="user-name">{{ currentUser.practitioner.name?.[0]?.given?.[0] }} {{ currentUser.practitioner.name?.[0]?.family }}</span>
          <span class="user-roles">{{ getUserRolesDisplay() }}</span>
        </div>
      </div>
      
      <ul class="nav-menu">
        <li *ngFor="let item of navigationItems" class="nav-item">
          <a 
            [routerLink]="item.route" 
            routerLinkActive="active"
            class="nav-link"
            [class.has-children]="item.children && item.children.length > 0">
            <i class="material-icons">{{ item.icon }}</i>
            <span>{{ item.label }}</span>
          </a>
          
          <ul *ngIf="item.children && item.children.length > 0" class="nav-submenu">
            <li *ngFor="let child of item.children" class="nav-subitem">
              <a 
                [routerLink]="child.route" 
                routerLinkActive="active"
                class="nav-sublink">
                <i class="material-icons">{{ child.icon }}</i>
                <span>{{ child.label }}</span>
              </a>
            </li>
          </ul>
        </li>
      </ul>
      
      <div class="nav-footer">
        <button (click)="logout()" class="logout-btn">
          <i class="material-icons">logout</i>
          <span>Logout</span>
        </button>
      </div>
    </nav>
  `,
  styles: [`
    .navigation {
      width: 250px;
      height: 100vh;
      background: #2c3e50;
      color: white;
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 1000;
    }

    .nav-header {
      padding: 1rem;
      border-bottom: 1px solid #34495e;
    }

    .nav-header h2 {
      margin: 0 0 0.5rem 0;
      color: #3498db;
      font-size: 1.5rem;
    }

    .user-info {
      font-size: 0.875rem;
    }

    .user-name {
      display: block;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .user-roles {
      color: #bdc3c7;
      font-size: 0.75rem;
    }

    .nav-menu {
      flex: 1;
      list-style: none;
      padding: 0;
      margin: 0;
      overflow-y: auto;
    }

    .nav-item {
      border-bottom: 1px solid #34495e;
    }

    .nav-link {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      color: white;
      text-decoration: none;
      transition: background-color 0.2s;
    }

    .nav-link:hover {
      background-color: #34495e;
    }

    .nav-link.active {
      background-color: #3498db;
    }

    .nav-link i {
      margin-right: 0.75rem;
      font-size: 1.25rem;
    }

    .nav-submenu {
      list-style: none;
      padding: 0;
      margin: 0;
      background-color: #34495e;
    }

    .nav-sublink {
      display: flex;
      align-items: center;
      padding: 0.5rem 1rem 0.5rem 3rem;
      color: #bdc3c7;
      text-decoration: none;
      font-size: 0.875rem;
      transition: background-color 0.2s;
    }

    .nav-sublink:hover {
      background-color: #2c3e50;
      color: white;
    }

    .nav-sublink.active {
      background-color: #3498db;
      color: white;
    }

    .nav-sublink i {
      margin-right: 0.5rem;
      font-size: 1rem;
    }

    .nav-footer {
      padding: 1rem;
      border-top: 1px solid #34495e;
    }

    .logout-btn {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 0.75rem;
      background: transparent;
      border: 1px solid #e74c3c;
      color: #e74c3c;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .logout-btn:hover {
      background-color: #e74c3c;
      color: white;
    }

    .logout-btn i {
      margin-right: 0.5rem;
    }
  `]
})
export class NavigationComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly authService = inject(AuthService);
  private readonly roleService = inject(RoleService);
  private readonly router = inject(Router);

  currentUser: UserProfile | null = null;
  navigationItems: NavigationItem[] = [];

  ngOnInit(): void {
    // Subscribe to current user changes
    this.authService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
      });

    // Subscribe to navigation items based on user roles
    this.roleService.getNavigationForCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.navigationItems = items;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getUserRolesDisplay(): string {
    if (!this.currentUser?.roles) {
      return '';
    }

    return this.currentUser.roles
      .map(role => this.roleService.getRoleDisplayName(role))
      .join(', ');
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout failed:', error);
      // Force navigation even if logout fails
      this.router.navigate(['/login']);
    }
  }
}
