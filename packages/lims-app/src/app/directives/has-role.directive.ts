import { 
  Directive, 
  Input, 
  OnDestroy, 
  OnInit, 
  TemplateRef, 
  ViewContainerRef 
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../types/fhir-types';

@Directive({
  selector: '[appHasRole]'
})
export class HasRoleDirective implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private hasView = false;

  @Input() set appHasRole(roles: UserRole | UserRole[]) {
    this.requiredRoles = Array.isArray(roles) ? roles : [roles];
    this.updateView();
  }

  @Input() appHasRoleRequireAll = false;

  private requiredRoles: UserRole[] = [];

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateView();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateView(): void {
    const user = this.authService.getCurrentUserSync();
    const userRoles = user?.roles || [];
    
    let hasAccess = false;

    if (this.requiredRoles.length === 0) {
      hasAccess = true;
    } else if (this.appHasRoleRequireAll) {
      hasAccess = this.requiredRoles.every(role => userRoles.includes(role));
    } else {
      hasAccess = this.requiredRoles.some(role => userRoles.includes(role));
    }

    if (hasAccess && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasAccess && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}