import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecimenAccessioning } from './specimen-accessioning';

describe('SpecimenAccessioning', () => {
  let component: SpecimenAccessioning;
  let fixture: ComponentFixture<SpecimenAccessioning>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SpecimenAccessioning]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpecimenAccessioning);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
