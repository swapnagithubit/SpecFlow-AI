Feature: User Login
  Allow users to log in with email and password, locking accounts after 5 failed attempts for 15 minutes.

  Scenario: Successful Login
    Given The user has a valid email 'user@example.com' and password 'Correct#123'.
    When The user logs in.
    Then The user is redirected to the dashboard.

  Scenario: Failed Login Attempt 1
    Given The user has a valid email 'user@example.com' and password 'Wrong#123'.
    When The user logs in.
    Then The login fails with error message 'Invalid password'.

  Scenario: Failed Login Attempt 5
    Given The user has a valid email 'user@example.com' and password 'Wrong#123'.
    When The user logs in.
    Then The account is locked for 15 minutes with error message 'Account locked due to too many failed attempts'.

  Scenario: Account Locked
    Given The user has a valid email 'user@example.com' and password 'Wrong#123'. The account has been locked for 15 minutes.
    When The user logs in.
    Then The login fails with error message 'Account locked due to too many failed attempts'.

  Scenario: Failed Login Attempt Just Below Limit
    Given The user has a valid email 'user@example.com' and password 'Wrong#123'. The account has been locked for 14 minutes.
    When The user logs in.
    Then The login fails with error message 'Invalid password'.

  Scenario: Failed Login Attempt Exactly at Limit
    Given The user has a valid email 'user@example.com' and password 'Wrong#123'. The account has been locked for 15 minutes.
    When The user logs in.
    Then The account is locked for 15 minutes with error message 'Account locked due to too many failed attempts'.

  Scenario: Correct Password Rejected While Account Locked
    Given The user has a valid email 'user@example.com' and password 'Correct#123'. The account has been locked for 15 minutes.
    When The user logs in.
    Then The login fails with error message 'Account locked due to too many failed attempts'.

  Scenario: Account Unlocked After 15 Minutes
    Given The user has a valid email 'user@example.com' and password 'Wrong#123'. The account has been locked for 15 minutes.
    When 15 minutes have passed.
    Then The account is no longer locked.
