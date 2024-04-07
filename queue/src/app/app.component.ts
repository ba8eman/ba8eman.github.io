import { Component, HostListener, ViewChild, ViewContainerRef } from '@angular/core';
import { FormControl } from '@angular/forms';


interface Person {
  name: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})

export class AppComponent {
 
people:Person[] = [];


constructor() {
  this.people.push({ name: 'John' });
  this.people.push({ name: 'Jane' });
  this.people.push({ name: 'Jim' });
  this.people.push({ name: 'Jill' });
}

}


  
  
 










