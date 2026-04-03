default:
    @just --list

alias b := build
alias d := dev
alias l := lint
alias t := typecheck
alias f := fix

build:
    bunx ray build

dev:
    bunx ray develop

lint:
    bunx ray lint

fix: fix-lint

fix-lint:
    bunx ray lint --fix

typecheck:
    bunx tsc --noEmit
