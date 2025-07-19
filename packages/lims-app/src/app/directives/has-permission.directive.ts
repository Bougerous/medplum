import { 
  Directive, 
  Input, 
  TemplateRef, 
  ViewContainerRef, 
  OnInit, 
  OnDestroy 
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { RoleService, RolePermissions } from '../services/role.service';

@Directive({
  selector: '[appHasPermission]'
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private hasView = false;

  @Input() set appHasPermission(permissions: keyof RolePermissions | (keyof RolePermissions)[]) {
    this.requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    this.updateView();
  }

  @Input() appHasPermissionRequireAll = false;

  private requiredPermissions: (keyof RolePermissions)[] = [];

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService,
    private roleService: RoleService
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
    
    if (!user) {
      if (this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
      return;
    }

    const permissions = this.roleService.getRolePermissions(user.roles);
    
    let hasAccess = false;

    if (this.requiredPermissions.length === 0) {
      hasAccess = true;
    } else if (this.appHasPermissionRequireAll) {
      hasAccess = this.requiredPermissions.every(perm => permissions[perm]);
    } else {
      hasAccess = this.requiredPermissions.some(perm => permissions[perm]);
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