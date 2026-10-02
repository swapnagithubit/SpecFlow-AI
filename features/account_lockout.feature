Feature: Account Lockout
  Prevent brute-force attacks by locking accounts after 5 failed login attempts.

  Scenario: Account remains unlocked after 4 failed attempts
    Given a registered user with 4 failed login attempts
    When the user attempts to log in with an incorrect password
    Then the login is successful

  Scenario: Account is locked after 5 failed attempts
    Given a registered user with 5 failed login attempts
    When the user attempts to log in with an incorrect password
    Then the error 'Account locked for 15 minutes' is shown

  Scenario: Account remains locked after 15 minutes
    Given a registered user with 5 failed login attempts and 15 minutes have passed
    When the user attempts to log in with an incorrect password
    Then the error 'Account locked for 15 minutes' is shown

  Scenario: Account is unlocked after 15 minutes and successful login
    Given a registered user with 5 failed login attempts and 15 minutes have passed
    When the user logs in with the correct password
    Then the login is successful

  Scenario: Account is locked after 5 failed attempts with correct password
    Given a registered user with 5 failed login attempts
    When the user attempts to log in with the correct password
    Then the error 'Account locked for 15 minutes' is shown

  Scenario: Account is unlocked after successful login
    Given a registered user with 5 failed login attempts
    When the user logs in with the correct password
    Then the login is successful
