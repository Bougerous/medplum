import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestOrdering } from './test-ordering';

describe('TestOrdering', () => {
  let component: TestOrdering;
  let fixture: ComponentFixture<TestOrdering>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestOrdering]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestOrdering);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
