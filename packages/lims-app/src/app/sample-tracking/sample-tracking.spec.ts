import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SampleTracking } from './sample-tracking';

describe('SampleTracking', () => {
  let component: SampleTracking;
  let fixture: ComponentFixture<SampleTracking>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SampleTracking]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SampleTracking);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
