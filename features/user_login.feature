Feature: User Login
  Users can log in with their registered email and password. If the user enters an incorrect password 5 times, the account must be locked for 15 minutes.

  Scenario: Successful Login
    Given a registered user with email 'user@example.com' and password 'password123'
    When the user logs in with email 'user@example.com' and password 'password123'
    Then the user is logged in successfully

  Scenario: Invalid Credentials
    Given a registered user with email 'user@example.com' and password 'password123'
    When the user logs in with email 'user@example.com' and password 'Wrong#123'
    Then the error message 'Invalid email or password' is shown

  Scenario: Account Locked
    Given a registered user with email 'user@example.com' and password 'password123' who has entered 5 incorrect passwords
    When the user logs in with email 'user@example.com' and password 'Wrong#123'
    Then the error message 'Account locked for 15 minutes' is shown

  Scenario: Lock Time Has Passed
    Given a registered user with email 'user@example.com' and password 'password123' who has entered 5 incorrect passwords and 15 minutes have passed
    When the user logs in with email 'user@example.com' and password 'password123'
    Then the user is logged in successfully

  Scenario: Correct Password Rejected During Lock
    Given a registered user with email 'user@example.com' and password 'password123' who has entered 5 incorrect passwords and 15 minutes have not passed
    When the user logs in with email 'user@example.com' and password 'password123'
    Then the error message 'Account locked for 15 minutes' is shown

  Scenario: Just Below the Limit
    Given a registered user with email 'user@example.com' and password 'password123' who has entered 4 incorrect passwords
    When the user logs in with email 'user@example.com' and password 'Wrong#123'
    Then the error message 'Invalid email or password' is shown
