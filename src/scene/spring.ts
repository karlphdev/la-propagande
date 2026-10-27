// Ressort amorti intégré à pas fixe : donne l'inertie de toutes les interactions continues.
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    initial = 0,
    public stiffness = 60,
    public damping = 14,
  ) {
    this.value = initial;
    this.target = initial;
  }

  update(dt: number) {
    // Sous-pas pour rester stable même si un onglet revient après une longue pause.
    const steps = Math.min(8, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}
