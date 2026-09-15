describe('Pit Board site', () => {
  beforeEach(() => {
    cy.visit('/')
  })
  it('shows the promise in the headline', () => {
    cy.get('h1').contains('Your business on one board')
  })
  it('renders the sample board with its four stats', () => {
    cy.get('.board .stat').should('have.length', 4)
    cy.get('.board .dothis p').should('not.be.empty')
  })
  it('lists the three plans with prices', () => {
    cy.get('.plan .price b').should('have.length', 3)
    cy.get('.plan.featured h3').contains('Crew')
  })
  it('has a signup form that requires the basics', () => {
    cy.get('form.signup button[type=submit]').click()
    cy.get('form.signup .form-msg').should('contain', 'Name, business')
  })
})
