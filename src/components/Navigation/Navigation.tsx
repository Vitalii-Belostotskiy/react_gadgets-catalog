import React from 'react';
import cn from 'classnames';
import styles from './Navigation.module.scss';
import { Phone } from '../../types/PhoneType';
import { Accessories } from '../../types/Accessories';
import { Link } from 'react-router-dom';

type Props = {
  category: string;
  currentPage?: string;
  model: Phone | Accessories;
  back?: boolean;
};

export const Navigation: React.FC<Props> = ({
  category,
  currentPage,
  model,
  back,
}) => {
  return (
    <div className={cn(styles.container, styles.navigation)}>
      <div className={styles.navigation__main}>
        <Link
          to="/"
          className={cn(styles.navigation__icon, styles.navigation__home)}
        />
        <span
          className={cn(styles.navigation__icon, styles.navigation__arrow)}
        />
        <Link
          to={`/${model.category}`}
          className={cn(styles.navigation__text, {
            [styles['navigation__text--current']]: currentPage,
          })}
        >
          {category}
        </Link>

        {currentPage && (
          <>
            <span
              className={cn(styles.navigation__icon, styles.navigation__arrow)}
            />
            <span
              className={cn(
                styles.navigation__text,
                styles['navigation__text--position'],
              )}
            >
              {model.name}
            </span>
          </>
        )}
      </div>

      {back && (
        <Link to={'../'} className={styles.navigation__back}>
          <span
            className={cn(
              styles.navigation__icon,
              styles.navigation__arrow,
              styles['navigation__arrow--left'],
            )}
          />
          <span
            className={cn(
              styles.navigation__text,
              styles['navigation__text--back'],
            )}
          >
            Back
          </span>
        </Link>
      )}
    </div>
  );
};
