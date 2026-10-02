Feature: User Authentication
  Allow users to log in with email and password, with a security feature to lock accounts after 5 failed attempts for 15 minutes.

  Scenario: Successful Login
    Given a valid email and password
    When the user attempts to log in
    Then the user is successfully logged in

  Scenario: Failed Login Attempt
    Given an invalid email and password
    When the user attempts to log in
    Then the login attempt is denied

  Scenario: Account Lockout
    Given an account with 5 failed login attempts
    When the user attempts to log in
    Then the account is locked for 15 minutes

  Scenario: Account Unlock
    Given an account locked for 15 minutes
    When the user waits for 15 minutes
    Then the account is unlocked

  Scenario: Edge Case: Multiple Failed Attempts
    Given an account with multiple failed login attempts
    When the user attempts to log in
    Then the account is locked for 15 minutes
